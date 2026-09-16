// Trap triggering, for the hero and for monsters.
// C ref: trap.c -- wearing_iron_shoes(), floor_trigger(), check_in_air(),
// seetrap(), feeltrap(), trapnote(), mu_maybe_destroy_web(), t_missile(), thitm(),
// trapeffect_sqky_board(), trapeffect_dart_trap(), trapeffect_rocktrap(),
// trapeffect_bear_trap(), trapeffect_slp_gas_trap(),
// mselftouch(), trapeffect_pit(), trapeffect_telep_trap(), trapeffect_web(),
// trapeffect_statue_trap(), trapeffect_magic_trap(),
// trapeffect_rolling_boulder_trap(), trapeffect_landmine(),
// blow_up_landmine(),
// launch_drop_spot(), launch_obj(), trapeffect_selector(), dotrap(), mintrap().
//
// These are trap.c functions and belong beside js/trap.js's maketrap() group
// by file name. They are split out because they reach the display, naming,
// vision and monster subsystems, and js/display.js and js/startup_a11y.js
// both import js/trap.js: adding those edges to js/trap.js would put it inside
// the display import cycle. js/trap_erode_obj.js and js/trap_water_damage.js
// split the same file for the same reason.

import {
    ANTIMAGIC,
    ANTI_MAGIC,
    ARROW_TRAP,
    ARTICLE_NONE,
    ARTICLE_THE,
    A_CON,
    A_DEX,
    A_STR,
    ARM,
    BEAR_TRAP,
    BOLT_LIM,
    DART_TRAP,
    DEAF,
    DISP_END,
    DISP_FLASH,
    D_CLOSED,
    D_BROKEN,
    D_LOCKED,
    DOOR,
    DRAWBRIDGE_DOWN,
    FAILEDUNTRAP,
    FIRE_TRAP,
    FIRE_RES,
    FAINTED,
    FOOT,
    FORCEBUNGLE,
    FORCETRAP,
    FROMOUTSIDE,
    FUMBLING,
    HEAD,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    HOLE,
    HURTLING,
    IS_STWALL,
    IS_TREE,
    IRONBARS,
    In_quest,
    KILLED_BY,
    KILLED_BY_AN,
    NO_KILLER_PREFIX,
    NOTELL,
    LANDMINE,
    LAUNCH_KNOWN,
    LAUNCH_UNSEEN,
    LEFT_SIDE,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    INVIS,
    NOWEBMSG,
    PIT,
    POLY_TRAP,
    RIGHT_SIDE,
    RECURSIVETRAP,
    ROOM,
    ROCKTRAP,
    ROLL,
    ROLLING_BOULDER_TRAP,
    RUST_TRAP,
    SLEEP_RES,
    SEE_INVIS,
    M_SEEN_SLEEP,
    SLP_GAS_TRAP,
    SPIKED_PIT,
    SPINE,
    SQKY_BOARD,
    STATUE_TRAP,
    SUPPRESS_SADDLE,
    TELEP_TRAP,
    TOOKPLUNGE,
    TRAPDOOR,
    TT_BEARTRAP,
    TT_PIT,
    TT_WEB,
    Trap_Caught_Mon,
    Trap_Effect_Finished,
    Trap_Is_Gone,
    Trap_Killed_Mon,
    Trap_Moved_Mon,
    Upolyd,
    VIASITTING,
    VIBRATING_SQUARE,
    W_AMUL,
    WEB,
    ER_NOTHING,
    W_ARM,
    W_ARMF,
    W_ARMC,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
    W_SWAPWEP,
    W_WEP,
    IS_DOOR,
    WT_ELF,
    has_mgivenname,
    helpless,
    is_hole,
    is_pit,
    isok,
    undestroyable_trap,
    u_at,
} from './const.js';
import { stop_occupation } from './allmain.js';
import { placebc, unplacebc } from './ball.js';
import { acurr, exercise, poisoned } from './attrib.js';
import { map_trap, newsym, obj_to_glyph, tmp_at } from './display.js';
import { flooreffects, set_wounded_legs } from './do.js';
import { del_engr_at } from './engrave.js';
import { find_drawbridge, is_drawbridge_wall } from './dbridge.js';
import {
    at_dgn_entrance,
    Can_fall_thru,
    on_level,
    surface,
} from './dungeon.js';
import {
    capitalizedMonsterName,
    monsterCommonName,
    mon_nam,
    x_monnam,
} from './do_name.js';
import { game } from './gstate.js';
import { setmangry } from './mon.js';
import { dist2, distmin, sgn, upstart } from './hacklib.js';
import {
    UnsupportedHeroMoveBoundaryError,
    curs_on_u,
    losehp,
    nh_delay_output,
    nomul,
    spot_checks,
    u_locomotion,
} from './hack.js';
import { done } from './end.js';
import {
    SCATTER_MAY_DESTROY,
    SCATTER_MAY_FRACTURE,
    SCATTER_MAY_HIT,
    SCATTER_VIS_EFFECTS,
    scatter,
} from './explode.js';
import {
    obj_extract_self,
    obfree,
    stackobj,
    update_inventory,
} from './invent.js';
import {
    ART_MAGICBANE,
    defends_when_carried,
    is_art,
} from './artifacts.js';
import { count_wsegs } from './makemon_create.js';
import { maybe_unhide_at, monkilled, wake_nearto } from './mon.js';
import {
    acidic,
    amorphous,
    attacktype,
    breathless,
    completelyrusts,
    extra_nasty,
    flaming,
    grounded,
    is_clinger,
    is_floater,
    is_flyer,
    is_neuter,
    is_vampshifter,
    is_whirly,
    metallivorous,
    mindless,
    monster_resists_element,
    mon_knows_traps,
    mon_learns_traps,
    mons_see_trap,
    monstseesu,
    monstunseesu,
    pm_invisible,
    passes_rocks,
    passes_walls,
    resists_magm,
    strongmonst,
    throws_rocks,
    touch_petrifies,
    unsolid,
    webmaker,
} from './mondata.js';
import {
    AD_MAGM,
    AD_FIRE,
    AD_PHYS,
    AD_RBRE,
    AD_RUST,
    AT_BREA,
    AT_MAGC,
    MZ_HUGE,
    MZ_SMALL,
    PM_BALROG,
    PM_BALUCHITHERIUM,
    PM_BUGBEAR,
    PM_CYCLOPS,
    PM_GELATINOUS_CUBE,
    PM_GREMLIN,
    PM_IRON_GOLEM,
    PM_JABBERWOCK,
    PM_KRAKEN,
    PM_LEATHER_GOLEM,
    PM_LORD_SURTUR,
    PM_MASTODON,
    PM_NORN,
    PM_ORION,
    PM_OWLBEAR,
    PM_PAPER_GOLEM,
    PM_PIT_FIEND,
    PM_PIT_VIPER,
    PM_PURPLE_WORM,
    PM_RANGER,
    PM_STRAW_GOLEM,
    PM_TITANOTHERE,
    PM_WOOD_GOLEM,
    S_DRAGON,
    S_GIANT,
} from './monsters.js';
import { m_at } from './monst.js';
import { mpickobj } from './steal.js';
import { ohitmon, thitu } from './mthrowu.js';
import { sleep_monst } from './mhitm.js';
import { splash_monster_light } from './apply_splash_lit.js';
import {
    dealloc_obj,
    carried,
    isCandle,
    mksobj,
    objectType,
    place_object,
    remove_object,
    sobj_at,
    splitobj,
    stone_missile,
    weight,
} from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { observe_object } from './o_init.js';
import {
    AMULET_OF_LIFE_SAVING,
    BOULDER,
    BRASS_LANTERN,
    CANDELABRUM_OF_INVOCATION,
    CORPSE,
    DART,
    IRON,
    MAGIC_LAMP,
    OIL_LAMP,
    POT_OIL,
    ROCK,
    SADDLE,
    WAND_CLASS,
} from './objects.js';
import {
    an,
    cloak_simple_name,
    donameFresh,
    gloves_simple_name,
    helm_simple_name,
    just_an,
    otense,
    suit_simple_name,
    Yname2,
    xnameFresh,
} from './objnam.js';
import { encumber_msg } from './pickup.js';
import { body_part, mbodypart } from './polyself.js';
import { d, rn1, rn2, rn2_on_display_rng, rnd, rne, rnl } from './rng.js';
import {
    canSeeMonster,
    canSpotMonster,
    heroIsBlind,
    messageAt,
} from './startup_a11y.js';
import {
    Flying,
    Levitation,
    deltrap,
    fill_pit,
    conjoined_pits,
    adj_nonconjoined_pit,
    unconscious,
    reset_utrap,
    set_utrap,
    t_at,
    trapname,
} from './trap.js';
import { mlevel_tele_trap, mtele_trap, tele_trap } from './teleport.js';
import { resist } from './zap.js';
import { Punished } from './steed.js';
import { ttyPline } from './tty_message.js';
import { burnarmor } from './trap_erode_obj.js';
import { burn_floor_objects, destroy_items } from './zap_destroy_items.js';
import { ignite_items } from './apply_catch_lit.js';
import { is_ice } from './terrain.js';
import { end_burn, fall_asleep } from './timeout.js';
import { self_invis_message } from './potion.js';
import { note_unported } from './unported.js';
import { dmgval } from './weapon.js';
import {
    block_point,
    cansee,
    clear_path,
    couldsee,
    recalc_block_point,
} from './vision.js';
import { bimanual, find_mac, which_armor } from './worn.js';
import {
    water_damage,
    water_damage_monster_equipment,
} from './trap_water_damage.js';

// Five owners arrive through the caller's env rather than through an import.
// `mInAir` is mon.c m_in_air() and `youHear`/`heroDeaf` are pline.c You_hear()
// and youprop.h's Deaf; js/monmove.js holds all three, and importing it here
// would make the two files import each other. `message` and `redraw` are the
// planning clone's seams: a dry run must write neither the message window nor
// the map. `random` arrives the same way, and mintrap() checks it separately
// because it needs two named draws rather than one callable.
//
// Each is looked up through this helper, which throws on a missing owner
// rather than falling back, so a misspelled injection fails loudly instead of
// silently taking a default.
function requireTrapOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`a trap effect requires the ${name} owner`);
    return operation;
}

// trap.c:77-78, the two article tables, each indexed by trap->madeby_u. The
// bear trap's four messages read the capitalized one and trapeffect_pit()'s
// monster arm reads the lowercase one.
const a_your = Object.freeze(['a', 'your']);
const A_Your = Object.freeze(['A', 'Your']);

// The hero's dotrap() runs in the live game, never in the planning clone that
// mintrap() serves, so its env binds the real owners rather than dry-run
// seams. `unsupported` raises the movement boundary because every hero call
// site -- hack.c spoteffects() and, through it, domove() and teleds() -- sits
// under js/jsmain.js's movement catch.
function heroTrapEnv(state) {
    return {
        state,
        random: { d, rn1, rn2, rnd, rne, rnl },
        message: (line, target) => ttyPline(line, target ?? state),
        redraw: (x, y) => newsym(x, y),
        unsupported: (reason) => {
            throw new UnsupportedHeroMoveBoundaryError(reason);
        },
    };
}

// C ref: trap.c wearing_iron_shoes() (1097-1102).
export function wearing_iron_shoes(monster, state = game) {
    const armf = which_armor(monster, W_ARMF, state);
    return Boolean(armf && objectType(armf, state).oc_material === IRON);
}

// hack.h:1236 Maybe_Half_Phys(), expanded here for the same reason js/steed.js
// expands it there: it is a macro over one property, and each C file's port
// spells its macros out. youprop.h:341 defines Half_physical_damage as the
// intrinsic or the extrinsic, with no blocking term.
function Maybe_Half_Phys(dmg, state) {
    const halved = state.u?.uprops?.[HALF_PHDAM];
    return (halved?.intrinsic || halved?.extrinsic)
        ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: trap.c floor_trigger(). Is trap type ttyp triggered by touching the
// floor?
export function floor_trigger(ttyp) {
    switch (ttyp) {
    case ARROW_TRAP:
    case DART_TRAP:
    case ROCKTRAP:
    case SQKY_BOARD:
    case BEAR_TRAP:
    case LANDMINE:
    case ROLLING_BOULDER_TRAP:
    case SLP_GAS_TRAP:
    case RUST_TRAP:
    case FIRE_TRAP:
    case PIT:
    case SPIKED_PIT:
    case HOLE:
    case TRAPDOOR:
        return true;
    default:
        return false;
    }
}

// C ref: trap.c check_in_air() (1084-1095). Both arms are live: dotrap()
// passes the hero and mintrap() passes a monster. m_harmless_trap() at
// trap.c:1112 is the third call site and is not ported.
export function check_in_air(monster, trflags, state = game) {
    const is_you = monster === state.youmonst;
    const plunged = (trflags & (TOOKPLUNGE | VIASITTING)) !== 0;
    return (trflags & HURTLING) !== 0
        || (is_you ? Levitation(state) : is_floater(monster.data))
        || ((is_you ? Flying(state) : is_flyer(monster.data)) && !plunged);
}

// C ref: trap.h:125 fixed_tele_trap().
export function fixed_tele_trap(trap) {
    return trap.ttyp === TELEP_TRAP
        && isok(trap.teledest?.x, trap.teledest?.y);
}

// C ref: trap.c seetrap(). The redraw is injected because the planning clone
// paints nothing; the tseen write is real in both passes, which is why
// planningState() clones the level's trap list.
export function seetrap(trap, env) {
    const redraw = requireTrapOperation(env, 'redraw');
    if (!trap.tseen) {
        // C writes 1 into a bitfield; js/trap.js resetTrap() keeps tseen as a
        // boolean, and this is the same value in one representation.
        trap.tseen = true;
        redraw(trap.tx, trap.ty);
    }
}

// C ref: trap.c feeltrap() (3587-3594). The hero learns a trap by standing in
// it rather than by seeing it, so unlike seetrap() this repaints even when the
// trap was already known. map_trap() writes the trap's own glyph and newsym()
// then rewrites the square from whatever really covers it -- C's comment says
// "in case it's beneath something, redisplay the something", and the hero
// herself is one such something.
export function feeltrap(trap, env) {
    const redraw = requireTrapOperation(env, 'redraw');
    // C writes 1 into a bitfield; js/trap.js resetTrap() keeps tseen as a
    // boolean, and this is the same value in one representation.
    trap.tseen = true;
    map_trap(trap, 1, env.state);
    redraw(trap.tx, trap.ty);
}

// C ref: trap.c mu_maybe_destroy_web() (972-1014).
export async function mu_maybe_destroy_web(monster, domsg, trap, env) {
    const { state } = env;
    const species = monster.data;
    const isyou = monster === state.youmonst;
    if (!(amorphous(species) || is_whirly(species) || flaming(species)
        || unsolid(species) || species.pmidx === PM_GELATINOUS_CUBE))
        return false;

    const article = a_your[Number(Boolean(trap.madeby_u))];
    const message = requireTrapOperation(env, 'message');
    if (flaming(species) || acidic(species)) {
        if (domsg) {
            if (isyou) {
                await message(`You ${flaming(species) ? 'burn' : 'dissolve'}`
                    + ` ${article} spider web!`, state, env);
            } else {
                await message(messageAt(
                    `${capitalizedMonsterName(monster, state)}`
                    + ` ${flaming(species) ? 'burns' : 'dissolves'}`
                    + ` ${article} spider web!`,
                    monster.mx, monster.my, state,
                ), state, env);
            }
        }
        deltrap(trap, state);
        requireTrapOperation(env, 'redraw')(trap.tx, trap.ty);
        return true;
    }
    if (domsg) {
        if (isyou) {
            await message(`You flow through ${article} spider web.`, state, env);
        } else {
            await message(messageAt(
                `${capitalizedMonsterName(monster, state)}`
                + ` flows through ${article} spider web.`,
                monster.mx, monster.my, state,
            ), state, env);
            seetrap(trap, env);
        }
    }
    return true;
}

// C ref: trap.c trapnote()'s tnnames[].
const TRAP_NOTE_NAMES = Object.freeze([
    'C note', 'D flat', 'D note', 'E flat',
    'E note', 'F note', 'F sharp', 'G note',
    'G sharp', 'A note', 'B flat', 'B note',
]);

// C ref: trap.c trapnote(). C builds the article with just_an() into a static
// buffer and then concatenates the name onto it.
export function trapnote(trap, noprefix) {
    const name = TRAP_NOTE_NAMES[trap.tnote];
    return noprefix ? name : `${just_an(name)}${name}`;
}

// C ref: trap.c trapeffect_sqky_board() (1402-1476), monster arm (1439-1475).
// The `mtmp == &gy.youmonst` arm reaches the hero only through dotrap(), which
// is not ported. Soundeffect() is a tty-sound hook and writes nothing to the
// terminal the recorder captures.
async function trapeffect_sqky_board(monster, trap, _trflags, env) {
    const { state } = env;
    const mInAir = requireTrapOperation(env, 'mInAir');
    const heroDeaf = requireTrapOperation(env, 'heroDeaf');
    const youHear = requireTrapOperation(env, 'youHear');
    const message = requireTrapOperation(env, 'message');

    if (mInAir(monster, state)) return Trap_Effect_Finished;
    // stepped on a squeaky board
    const inSight = canSeeMonster(monster, state)
        || monster === state.u?.usteed;
    if (inSight) {
        if (!heroDeaf(state)) {
            await message(
                messageAt(
                    `A board beneath ${monsterCommonName(monster, state)}`
                    + ` squeaks ${trapnote(trap, false)} loudly.`,
                    monster.mx,
                    monster.my,
                    state,
                ),
                state,
                env,
            );
            seetrap(trap, env);
        } else if (!mindless(monster.data)) {
            await message(
                messageAt(
                    `${capitalizedMonsterName(monster, state)} stops`
                    + ' momentarily and appears to cringe.',
                    monster.mx,
                    monster.my,
                    state,
                ),
                state,
                env,
            );
        }
    } else {
        // same near/far threshold as mzapmsg()
        const range = couldsee(monster.mx, monster.my, state)
            ? BOLT_LIM + 1 : BOLT_LIM - 3; /* 9 or 5 */
        const near = dist2(monster.mx, monster.my, state.u.ux, state.u.uy)
            <= range * range;
        const heard = youHear(
            `${trapnote(trap, false)} squeak `
            + `${near ? 'nearby' : 'in the distance'}.`,
            state,
        );
        if (heard) await message(heard, state, env);
    }
    // wake up nearby monsters
    await wake_nearto(monster.mx, monster.my, 40, env);
    return Trap_Effect_Finished;
}

// C ref: trap.c t_missile(). Make a single arrow/dart/rock for a trap to
// shoot or drop. mksobj() draws mkobj.c's whole WEAPON_CLASS initialization
// sequence, which is longer than it looks and is owned elsewhere: see
// js/obj.js mksobj_init() for the quantity, enchantment, blessing and poison
// draws -- blessorcurse() spends its own rn2(10) and sometimes rn2(2) on the
// common path -- and the erosion block for the rest. Do not enumerate it here;
// an earlier version of this comment did and was wrong in both directions.
// Every draw survives the overrides below, which only change the fields C
// overwrites.
function t_missile(otyp, trap, env) {
    const otmp = mksobj(otyp, true, false, env.objectEnv);

    otmp.quan = 1;
    otmp.owt = weight(otmp, env.objectEnv);
    // C assigns 0 to an unsigned bitfield; js/obj.js mksobj_init() keeps
    // opoisoned as a boolean, and this is the same value.
    otmp.opoisoned = false;
    otmp.ox = trap.tx;
    otmp.oy = trap.ty;
    return otmp;
}

// C ref: trap.c thitm() (6709-6773). "Monster is hit by trap." Fully ported.
//
// C declares this `staticfn` and the port exports it, as it exports
// trapnote() above, because a test has to reach it without a caller. Its
// production callers are trapeffect_dart_trap(), trapeffect_pit() and
// trapeffect_rocktrap() below.
export async function thitm(tlev, mon, obj, d_override, nocorpse, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const redraw = requireTrapOperation(env, 'redraw');
    let trapkilled = false;

    let strike;
    if (d_override)
        strike = 1;
    else if (obj)
        strike = find_mac(mon, state) + tlev + obj.spe <= random.rnd(20);
    else
        strike = find_mac(mon, state) + tlev <= random.rnd(20);

    /* Actually more accurate than thitu, which doesn't take
     * obj->spe into account.
     */
    if (!strike) {
        if (obj && cansee(mon.mx, mon.my, state)) {
            // doname() runs for its discovery side effects as well as its
            // text: xname() calls observe_object(), which sets dknown and
            // enters the type in the hero's discoveries. C names the missile
            // while it is still free, before place_object() puts it on the
            // floor.
            await message(
                messageAt(
                    `${capitalizedMonsterName(mon, state)} is almost hit by`
                    + ` ${donameFresh(obj, state)}!`,
                    mon.mx,
                    mon.my,
                    state,
                ),
                state,
                env,
            );
        }
    } else {
        let dam = 1;
        // A rock or gem passes straight through a rock-passing monster; the
        // missile is named and reported all the same, and only the damage is
        // skipped.
        const harmless = Boolean(obj) && stone_missile(obj, state)
            && passes_rocks(mon.data);

        if (obj && cansee(mon.mx, mon.my, state)) {
            // doname() runs for its discovery side effects here too; see the
            // miss arm above.
            await message(
                messageAt(
                    `${capitalizedMonsterName(mon, state)} is hit by`
                    + ` ${donameFresh(obj, state)}`
                    + `${harmless ? ' but is not harmed.' : '!'}`,
                    mon.mx,
                    mon.my,
                    state,
                ),
                state,
                env,
            );
        }
        if (d_override) {
            dam = d_override;
        } else if (obj) {
            dam = dmgval(obj, mon, state, { random });
            if (dam < 1) dam = 1;
        }
        if (!harmless) {
            mon.mhp -= dam;
            if (mon.mhp <= 0) {
                const xx = mon.mx;
                const yy = mon.my;

                await monkilled(mon, '', nocorpse ? -AD_RBRE : AD_PHYS,
                                state, env);
                if (mon.mhp < 1) { /* DEADMONSTER() */
                    redraw(xx, yy);
                    trapkilled = true;
                }
            }
        } else {
            strike = 0; /* harmless; don't use up the missile */
        }
    }
    // C ref: trap.c:6766-6770. A missile that missed, or that a forced-damage
    // caller supplied, lands where the target stands; one that struck on its
    // own to-hit roll is used up. No newsym() follows in C.
    if (obj && (!strike || d_override)) {
        place_object(obj, mon.mx, mon.my, env.objectEnv);
        stackobj(obj, env.objectEnv);
    } else if (obj) {
        dealloc_obj(obj, env.objectEnv);
    }
    return trapkilled;
}

// C ref: trap.c trapeffect_dart_trap() (1250-1321), hero arm (1259-1293) and
// monster arm (1294-1318).
//
// Hero arm: the dart shoots, thitu() rolls to hit, poisoned() applies on hit,
// or the dart lands on the floor on miss.
//
// Two hero branches stop:
//   misfire (trap->once && trap->tseen && !rn2(15), C 1262-1267): needs
//     pline.c You_hear(), which js/monmove.js owns and which heroTrapEnv()
//     does not bind. The rn2(15) draw happens regardless, and only when it
//     returns 0 does the arm need the message; the port refuses there rather
//     than at entry.
//   steed (u.usteed, C 1276): calls steedintrap(), which is not ported.
//     preflight_dotrap() refuses when u.usteed is set, so this is unreachable.
//
// The monster arm is fully ported, misfire included.
async function trapeffect_dart_trap(mtmp, trap, _trflags, env) {
    const { state } = env;
    const random = env.random;
    const unsupported = requireTrapOperation(env, 'unsupported');
    const message = requireTrapOperation(env, 'message');
    const redraw = requireTrapOperation(env, 'redraw');
    const objectEnv = objectGenerationEnv({ state, random });

    if (mtmp === state.youmonst) {
        // ── hero arm (C 1259-1293) ──
        const oldumort = state.u.umortality ?? 0;

        // C 1262-1267: misfire check. The rn2(15) draw fires only when both
        // conditions are true; its roll is part of the recorded PRNG log.
        if (trap.once && trap.tseen && !random.rn2(15)) {
            // You_hear("a soft click.") is unavailable in the hero env.
            // Soundeffect() is a tty-sound hook and writes nothing.
            unsupported('a dart trap that wears out');
        }
        trap.once = true;
        seetrap(trap, env);
        await message('A little dart shoots out at you!', state);
        const otmp = t_missile(DART, trap, { ...env, objectEnv });
        if (!random.rn2(6)) otmp.opoisoned = true;
        const dam = dmgval(otmp, state.youmonst, state, { random });
        // C 1276: a mounted hero gives the dart to the steed on a successful
        // one-in-two gate; steedintrap()'s return supplies that gate's value.
        const steedHit = state.u.usteed && !random.rn2(2)
            && await steedintrap(trap, otmp, { ...env, objectEnv });
        if (steedHit) {
            // nothing
        } else if (await thitu(
            7,
            Maybe_Half_Phys(dam, state),
            otmp,
            'little dart',
            state,
            {
                random,
                message: (text, target) => message(text, target ?? state),
                losehp: (n, knam, k_format) => losehp(n, knam, k_format, state),
                exercise: (index, increase) => exercise(
                    index, increase, state, random,
                    { encumberMessage: (subject) => encumber_msg(subject) },
                ),
            },
        )) {
            if (otmp) {
                if (otmp.opoisoned) {
                    await poisoned(
                        'dart', A_CON, 'little dart',
                        // If damage triggered life-saving, poison is limited
                        // to attribute loss (fatal=0 means no instant kill).
                        (state.u.umortality ?? 0) > oldumort ? 0 : 10,
                        true, // thrown_weapon
                        state,
                        {
                            random,
                            message: (text) => message(text, state),
                            losehp: (n, knam, k_format) =>
                                losehp(n, knam, k_format, state),
                            done: (how) => done(how, state),
                            encumberMessage: (s) => encumber_msg(s),
                        },
                    );
                }
                obfree(otmp, null, { state });
            }
        } else {
            // Miss: dart lands on the floor.
            place_object(otmp, state.u.ux, state.u.uy, { state });
            if (!heroIsBlind(state))
                observe_object(otmp, state);
            stackobj(otmp, { state });
            newsym(state.u.ux, state.u.uy);
        }
        return Trap_Effect_Finished;
    }

    // ── monster arm (C 1294-1318) ──
    const inSight = canSeeMonster(mtmp, state) || mtmp === state.u?.usteed;
    const see_it = cansee(mtmp.mx, mtmp.my, state);

    if (trap.once && trap.tseen && !random.rn2(15)) {
        // C 1298-1306: the trap wears out. `see_it` is read only here.
        if (inSight && see_it) {
            await message(
                messageAt(
                    `${capitalizedMonsterName(mtmp, state)} triggers a trap`
                    + ' but nothing happens.',
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
                env,
            );
        }
        deltrap(trap, state);
        redraw(mtmp.mx, mtmp.my);
        return Trap_Is_Gone;
    }
    // C writes 1 into a bitfield; js/trap.js resetTrap() keeps once as a
    // boolean, and this is the same value in one representation.
    trap.once = true;
    const otmp = t_missile(DART, trap, { ...env, objectEnv });
    if (!random.rn2(6)) otmp.opoisoned = true;
    if (inSight) seetrap(trap, env);
    const trapkilled = await thitm(
        7,
        mtmp,
        otmp,
        0,
        false,
        { ...env, objectEnv },
    );

    return trapkilled ? Trap_Killed_Mon
        : mtmp.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
}

// C ref: trap.c trapeffect_rocktrap() (1322-1399), monster arm (1375-1398).
//
// The hero arm (1332-1374) stops the scan, and preflight_dotrap() refuses
// ROCKTRAP ahead of the hero's move so that nothing reaches the stop here: the
// arm needs uarmh, passes_rocks() over the hero's form, hard_helmet(),
// helm_simple_name() and Yname2() for the three helmet lines, and
// losehp(Maybe_Half_Phys(dmg)) after them.
//
// The monster arm is the dart trap's monster arm with a rock instead of a
// dart, no poison roll, and a forced d(2, 6) of damage rather than a to-hit
// roll at attack level 7. C evaluates that d(2, 6) as thitm()'s argument, so
// the draw lands before anything inside thitm(); the port spends it in the
// same place.
async function trapeffect_rocktrap(mtmp, trap, _trflags, env) {
    const { state } = env;
    const random = env.random;
    const unsupported = requireTrapOperation(env, 'unsupported');
    const message = requireTrapOperation(env, 'message');
    const redraw = requireTrapOperation(env, 'redraw');
    const objectEnv = objectGenerationEnv({ state, random });

    if (mtmp === state.youmonst)
        unsupported('a rock falling on the hero');

    // ── monster arm (C 1375-1398) ──
    const in_sight = canSeeMonster(mtmp, state) || mtmp === state.u?.usteed;
    // C 1377. Read only by the wear-out message below; the falling-rock path
    // guards seetrap() on in_sight alone.
    const see_it = cansee(mtmp.mx, mtmp.my, state);

    if (trap.once && trap.tseen && !random.rn2(15)) {
        // C 1380-1388: the trap door opens on an empty chute.
        if (in_sight && see_it) {
            await message(
                messageAt(
                    'A trap door above'
                    + ` ${monsterCommonName(mtmp, state)} opens, but nothing`
                    + ' falls out!',
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
                env,
            );
        }
        deltrap(trap, state);
        redraw(mtmp.mx, mtmp.my);
        return Trap_Is_Gone;
    }
    // C writes 1 into a bitfield; js/trap.js resetTrap() keeps once as a
    // boolean, and this is the same value in one representation.
    trap.once = true;
    const otmp = t_missile(ROCK, trap, { ...env, objectEnv });
    if (in_sight) seetrap(trap, env);
    const trapkilled = await thitm(
        0,
        mtmp,
        otmp,
        random.d(2, 6),
        false,
        { ...env, objectEnv },
    );

    return trapkilled ? Trap_Killed_Mon
        : mtmp.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
}

// C ref: trap.c trapeffect_bear_trap() (1478-1560), hero arm (1489-1524) and
// monster arm (1525-1558), both ported.
//
// Two of the hero arm's branches stop, and both are refused ahead of the move
// by preflight_dotrap() rather than here, so that no refusal lands after
// feeltrap() has repainted or set_utrap() has written u.utrap: the mounted arm
// at 1507-1511 needs s_suffix(mon_nam()) and mbodypart(), and the iron-shoes
// line at 1517-1518 needs Yname2(). `dmg` is rolled before either of them, at
// C's position, because the roll happens whether or not the branch that spends
// it is taken.
//
// The monster arm's own d(2, 4) sits where C spends it, after the catch
// message rather than before: the hero arm's roll leads its messages and this
// one trails them. C blocks inside pline_mon() at 1534 until the hero clears
// the --More--, and only then evaluates thitm()'s argument at 1554, so the
// draw lands in the keystroke that dismissed the message and not in the one
// that moved the monster. The port reaches the same order by awaiting the
// message seam, which suspends in the live pass and returns at once in the
// cloned planning pass, leaving the draw at the same position in both.
async function trapeffect_bear_trap(mtmp, trap, trflags, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const is_you = mtmp === state.youmonst;
    const forcetrap = (trflags & FORCETRAP) !== 0
        || (trflags & FAILEDUNTRAP) !== 0
        || (is_you && (trflags & VIASITTING) !== 0);

    if (!is_you) {
        // The two owners the hero arm never reads, so neither can move to the
        // top of the function: dotrap()'s heroTrapEnv() binds neither. Both
        // are resolved before the mtrapped write below, so a missing
        // injection throws with nothing yet changed or drawn.
        const mInAir = requireTrapOperation(env, 'mInAir');
        const youHear = requireTrapOperation(env, 'youHear');
        const mptr = mtmp.data;
        const in_sight = canSeeMonster(mtmp, state) || mtmp === state.u?.usteed;
        let trapkilled = false;

        if (mptr.msize > MZ_SMALL && !amorphous(mptr) && !mInAir(mtmp, state)
            && !is_whirly(mptr) && !unsolid(mptr)) {
            // C assigns 1 to an unsigned bitfield; js/monst.js and
            // js/makemon_create.js both keep mtrapped as a boolean.
            mtmp.mtrapped = true;
            if (in_sight) {
                await message(
                    messageAt(
                        `${capitalizedMonsterName(mtmp, state)} is caught in`
                        + ` ${a_your[trap.madeby_u ? 1 : 0]} bear trap!`,
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
                seetrap(trap, env);
            } else if (mptr === state.mons[PM_OWLBEAR]
                       || mptr === state.mons[PM_BUGBEAR]) {
                // Soundeffect() is a tty-sound hook and writes nothing to the
                // terminal the recorder captures, as in
                // trapeffect_sqky_board() above.
                const heard = youHear('the roaring of an angry bear!', state);
                if (heard) await message(heard, state, env);
            }
        } else if (forcetrap) {
            if (in_sight) {
                await message(
                    messageAt(
                        `${capitalizedMonsterName(mtmp, state)} evades`
                        + ` ${a_your[trap.madeby_u ? 1 : 0]} bear trap!`,
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
                seetrap(trap, env);
            }
        }
        if (mtmp.mtrapped && !wearing_iron_shoes(mtmp, state)) {
            trapkilled = await thitm(
                0,
                mtmp,
                null,
                random.d(2, 4),
                false,
                env,
            );
        }

        return trapkilled ? Trap_Killed_Mon
            : mtmp.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
    }

    const dmg = random.d(2, 4);

    if ((Levitation(state) || Flying(state)) && !forcetrap)
        return Trap_Effect_Finished;
    feeltrap(trap, env);
    const you = state.youmonst.data;
    if (amorphous(you) || is_whirly(you) || unsolid(you)) {
        await message(
            `${A_Your[trap.madeby_u ? 1 : 0]} bear trap closes harmlessly`
            + ' through you.',
            state,
            env,
        );
        return Trap_Effect_Finished;
    }
    if (!state.u.usteed && you.msize <= MZ_SMALL) {
        await message(
            `${A_Your[trap.madeby_u ? 1 : 0]} bear trap closes harmlessly`
            + ' over you.',
            state,
            env,
        );
        return Trap_Effect_Finished;
    }
    set_utrap(random.rn1(4, 4), TT_BEARTRAP, state);
    await message(
        `${A_Your[trap.madeby_u ? 1 : 0]} bear trap closes on your`
        + ` ${body_part(FOOT, state.youmonst)}!`,
        state,
        env,
    );
    if (state.u.umonnum === PM_OWLBEAR || state.u.umonnum === PM_BUGBEAR)
        await message('You howl in anger!', state, env);
    // C ref: trap.c:1520. rn2(2) picks the leg and rn1(10, 10) the recovery
    // time; hack.c weight_cap() reads the side bits and timeout.c nh_timeout()
    // counts the time down.
    await set_wounded_legs(
        random.rn2(2) ? RIGHT_SIDE : LEFT_SIDE,
        random.rn1(10, 10),
        state,
    );
    await losehp(Maybe_Half_Phys(dmg, state), 'bear trap', KILLED_BY_AN, state);
    await exercise(A_DEX, false, state, random);
    return Trap_Effect_Finished;
}

// C ref: trap.c trapeffect_slp_gas_trap() (1563-1592), both hero and monster
// arms. `trflags` is intentionally unused by the C function.
async function trapeffect_slp_gas_trap(mtmp, trap, _trflags, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');

    if (mtmp === state.youmonst) {
        seetrap(trap, env);
        const resistance = state.u?.uprops?.[SLEEP_RES];
        if (resistance?.intrinsic || resistance?.extrinsic
            || breathless(state.youmonst.data)) {
            await message('You are enveloped in a cloud of gas!', state, env);
            monstseesu(M_SEEN_SLEEP, state);
        } else {
            await message('A cloud of gas puts you to sleep!', state, env);
            await fall_asleep(-random.rnd(25), true, state, { message });
            monstunseesu(M_SEEN_SLEEP, state);
        }
        // C discards steedintrap()'s return. An unmounted hero takes its
        // no-op guard; a mounted hero gives the gas effect to its steed.
        await steedintrap(trap, null, env);
    } else {
        const in_sight = canSeeMonster(mtmp, state)
            || mtmp === state.u?.usteed;
        if (!monster_resists_element(mtmp, SLEEP_RES, state)
            && !breathless(mtmp.data) && !helpless(mtmp)
            && await sleep_monst(mtmp, random.rnd(25), -1, env)
            && in_sight) {
            await message(
                messageAt(
                    `${capitalizedMonsterName(mtmp, state)}`
                    + ' suddenly falls asleep!',
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
                env,
            );
            seetrap(trap, env);
        }
    }
    return Trap_Effect_Finished;
}

// C ref: trap.c mselftouch() (3912-3933). A monster that has just been thrown
// about touches its own wielded corpse; trapeffect_pit()'s monster arm below
// is the caller this port was written for.
//
// Only the guard is ported. The body needs minstapetrify() and corpse_xname(),
// neither of which is ported, so it stops the scan. The stop is one conjunct
// wider than C's condition: monst.h:279 resists_ston() expands to
// mondata.c Resists_Elem() (129-231), which is not ported either, so the port
// also stops for a stone-resistant monster, which C would let walk away.
export function mselftouch(mon, _arg, _byplayer, env) {
    const { state } = env;
    const unsupported = requireTrapOperation(env, 'unsupported');
    const mwep = mon.mw; /* MON_WEP() */

    if (mwep && mwep.otyp === CORPSE
        && touch_petrifies(state.mons?.[mwep.corpsenm]))
        unsupported('a monster touching its wielded corpse');
}

// C ref: trap.c steedintrap() (3102-3159). The helper is shared by the hero
// arms of dart, bear, magic and land mines, and trapeffect_pit() consumes its
// non-zero result before applying damage to the rider. Keep the return value
// separate from the monster result constants: C returns 1 for a hit steed and
// Trap_Killed_Mon only when the steed dies.
async function steedintrap(trap, otmp, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const steed = state.u?.usteed;

    if (!steed || !trap) return Trap_Effect_Finished;
    steed.mx = state.u.ux;
    steed.my = state.u.uy;

    let trapkilled = false;
    let steedhit = false;
    switch (trap.ttyp) {
    case ARROW_TRAP:
        if (!otmp) {
            note_unported('trap.c impossible steed arrow');
            return Trap_Effect_Finished;
        }
        trapkilled = await thitm(8, steed, otmp, 0, false, env);
        steedhit = true;
        break;
    case DART_TRAP:
        if (!otmp) {
            note_unported('trap.c impossible steed dart');
            return Trap_Effect_Finished;
        }
        trapkilled = await thitm(7, steed, otmp, 0, false, env);
        steedhit = true;
        break;
    case SLP_GAS_TRAP:
        if (!monster_resists_element(steed, SLEEP_RES, state)
            && !breathless(steed.data) && !helpless(steed)
            && await sleep_monst(steed, random.rnd(25), -1, env)) {
            await message(
                `${capitalizedMonsterName(steed, state, env)} suddenly falls asleep!`,
                state,
                env,
            );
        }
        steedhit = true;
        break;
    case LANDMINE:
        trapkilled = await thitm(0, steed, null, random.rnd(16), false, env);
        steedhit = true;
        break;
    case PIT:
    case SPIKED_PIT:
        trapkilled = steed.mhp < 1
            || await thitm(
                0,
                steed,
                null,
                random.rnd(trap.ttyp === PIT ? 6 : 10),
                false,
                env,
            );
        steedhit = true;
        break;
    case POLY_TRAP:
        if (!resists_magm(steed, state)
            && !await resist(steed, WAND_CLASS, 0, NOTELL, state, random)) {
            // C discards newcham()'s return. The general shape-changing path
            // still needs inventory and attachment handling, so retain the
            // explicit source gap while preserving the resistance draw.
            note_unported('mon.c newcham steed');
        }
        steedhit = true;
        break;
    default:
        break;
    }

    if (trapkilled) {
        // C discards dismount_steed() here. Its poly-dismount body is not
        // ported, so preserve the source call as an explicit boundary gap
        // rather than raising after the steed's trap result is computed.
        note_unported('steed.c dismount_steed DISMOUNT_POLY');
        return Trap_Killed_Mon;
    }
    return steedhit ? 1 : 0;
}

// C ref: trap.c trapeffect_pit() (1824-2010), monster arm (1966-2008).
//
// trapeffect_selector() dispatches both PIT and SPIKED_PIT here. The selector's
// hero preflight admits both trap types, and the complete monster arm and
// source spike branches remain available to their respective callers.
async function trapeffect_pit(mtmp, trap, trflags, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const unsupported = requireTrapOperation(env, 'unsupported');

    if (mtmp === state.youmonst) {
        const plunged = (trflags & TOOKPLUNGE) !== 0;
        const viasitting = (trflags & VIASITTING) !== 0;
        const trapWithHero = t_at(state.u.ux0, state.u.uy0, state);
        const conjPit = conjoined_pits(trap, trapWithHero, true, state);
        const adjPit = adj_nonconjoined_pit(trap, state);
        const alreadyKnown = Boolean(trap.tseen);
        let deliberate = false;
        let steedArticle = ARTICLE_THE;
        const steed = state.u.usteed;

        if (steed && has_mgivenname(steed) && !Hallucination(state))
            steedArticle = ARTICLE_NONE;

        // KMH -- You can't escape the Sokoban level traps.
        const sokoban = Boolean(state.level?.flags?.sokoban_rules);
        if (!sokoban && (Levitation(state)
            || (Flying(state) && !plunged && !viasitting)))
            return Trap_Effect_Finished;

        feeltrap(trap, env);
        if (!sokoban && is_clinger(state.youmonst.data) && !plunged) {
            if (alreadyKnown) {
                await message(
                    `${heroIsBlind(state) ? 'You sense' : 'You see'} `
                        + `${a_your[trap.madeby_u ? 1 : 0]} ${trap.ttyp === SPIKED_PIT
                            ? 'spiked ' : ''}pit below you.`,
                    state,
                    env,
                );
            } else {
                await message(
                    `${A_Your[trap.madeby_u ? 1 : 0]} pit ${trap.ttyp === SPIKED_PIT
                        ? 'full of spikes ' : ''}opens up under you!`,
                    state,
                    env,
                );
                await message("You don't fall in!", state, env);
            }
            return Trap_Effect_Finished;
        }

        if (!sokoban) {
            let verbbuf = '';
            if (steed) {
                if ((trflags & RECURSIVETRAP) !== 0) {
                    verbbuf = `and ${x_monnam(steed, steedArticle, null,
                        SUPPRESS_SADDLE, false, state, env)} fall`;
                } else {
                    verbbuf = `lead ${x_monnam(steed, steedArticle, 'poor',
                        SUPPRESS_SADDLE, false, state, env)}`;
                }
            } else if (state.iflags?.menu_requested && alreadyKnown) {
                await message(
                    `You carefully ${u_locomotion('lower yourself', state)} into the pit.`,
                    state,
                    env,
                );
                deliberate = true;
            } else if (conjPit) {
                await message('You move into an adjacent pit.', state, env);
            } else if (adjPit) {
                const between = !random.rn2(5) ? ' between the pits' : '';
                await message(`You stumble over debris${between}.`, state, env);
            } else {
                verbbuf = !plunged ? 'fall' : (Flying(state) ? 'dive' : 'plunge');
            }
            if (verbbuf)
                await message(`You ${verbbuf} into ${a_your[trap.madeby_u ? 1 : 0]} pit!`, state, env);
        }

        // Wumpus reference. Is_qlocate() is on_level() against the quest's
        // locate level in this port; `trap.once` is C's one-shot latch.
        if (state.urole?.mnum === PM_RANGER
            && !trap.madeby_u && !trap.once && In_quest(state.u.uz)
            && on_level(state.u.uz, state.qlocate_level)) {
            await message('Fortunately it has a bottom after all...', state, env);
            trap.once = true;
        } else if (state.u.umonnum === PM_PIT_VIPER
            || state.u.umonnum === PM_PIT_FIEND) {
            await message("How pitiful.  Isn't that the pits?", state, env);
        }

        let relevantSpikes = trap.ttyp === SPIKED_PIT;
        if (relevantSpikes && wearing_iron_shoes(mtmp, state)) {
            await message(
                `${Yname2(state.uarmf, state)} protects you from the sharp iron spikes.`,
                state,
                env,
            );
            relevantSpikes = false;
        } else if (relevantSpikes) {
            const predicament = 'on a set of sharp iron spikes';
            if (steed) {
                await message(`${upstart(x_monnam(steed, steedArticle, 'poor',
                    SUPPRESS_SADDLE, false, state, env))} ${conjPit ? 'steps' : 'lands'} ${predicament}!`, state, env);
            } else {
                await message(`You ${conjPit ? 'step' : 'land'} ${predicament}!`, state, env);
            }
        }

        set_utrap(random.rn1(6, 2), TT_PIT, state);
        // C's return-valued helper is ported above; a zero result means the
        // steed did not absorb this trap's damage.
        if (!(await steedintrap(trap, null, env))) {
            if (relevantSpikes) {
                const oldumort = state.u.umortality ?? 0;
                const spikeDamage = random.rnd(conjPit ? 4 : adjPit ? 6 : 10);
                await losehp(
                    Maybe_Half_Phys(spikeDamage, state),
                    plunged ? 'deliberately plunged into a pit of iron spikes'
                        : (conjPit || deliberate) ? 'stepped into a pit of iron spikes'
                            : adjPit ? 'stumbled into a pit of iron spikes'
                                : 'fell into a pit of iron spikes',
                    NO_KILLER_PREFIX,
                    state,
                    env,
                );
                if (!random.rn2(6)) {
                    const poisonDamage = (state.u.umortality ?? 0) > oldumort ? 0 : 8;
                    await poisoned('spikes', A_STR,
                        (conjPit || adjPit || deliberate)
                            ? 'stepping on poison spikes' : 'fall onto poison spikes',
                        poisonDamage, false, state, {
                            ...env,
                            message: (text) => message(text, state),
                            losehp: (amount, killer, format) =>
                                losehp(amount, killer, format, state),
                            done: (how) => done(how, state),
                            encumberMessage: (subject) => encumber_msg(subject),
                        });
                }
            } else if (!conjPit && !deliberate
                && !(plunged && (Flying(state) || is_clinger(state.youmonst.data)))) {
                await losehp(
                    Maybe_Half_Phys(random.rnd(adjPit ? 3 : 6), state),
                    plunged ? 'deliberately plunged into a pit' : 'fell into a pit',
                    NO_KILLER_PREFIX,
                    state,
                    env,
                );
            }
            // ball.c's three calls have no JavaScript ballfall counterpart;
            // preserve source order while recording only the missing middle
            // operation; all three calls have discarded return values.
            if (Punished(state) && !carried(state.uball)) {
                unplacebc(state);
                note_unported('ball.c ballfall after pit');
                await placebc(state);
            }
            if (!conjPit) note_unported('trap.c selftouch');
            state.vision_full_recalc = 1;
            const exerciseEnv = {
                encumberMessage: (subject) => encumber_msg(subject),
            };
            await exercise(A_STR, false, state, random, exerciseEnv);
            await exercise(A_DEX, false, state, random, exerciseEnv);
        }
        return Trap_Effect_Finished;
    }

    const in_sight = canSeeMonster(mtmp, state) || mtmp === state.u?.usteed;
    const forcetrap = (trflags & FORCETRAP) !== 0;
    const sokoban = Boolean(state.level?.flags?.sokoban_rules);
    const inescapable = forcetrap || (sokoban && !trap.madeby_u);
    const mptr = mtmp.data;
    let fallverb = 'falls';

    // C ref: trap.c:1975. The airborne and long-worm terms share one
    // avoidance/forced/Sokoban branch; count_wsegs() is source-faithful in
    // makemon_create.js and is evaluated only when wormno is nonzero.
    const falling = !grounded(mptr, state)
        || (mtmp.wormno && count_wsegs(mtmp, state) > 5);
    if (falling) {
        if (forcetrap && !sokoban) {
            /* openfallingtrap; not inescapable here */
            if (in_sight) {
                seetrap(trap, env);
                await message(
                    messageAt(
                        `${capitalizedMonsterName(mtmp, state, env)} doesn't fall`
                        + ' into the pit.',
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
            }
            return Trap_Effect_Finished;
        }
        if (!inescapable) return Trap_Effect_Finished; /* avoids trap */
        fallverb = 'is dragged'; /* sokoban pit */
    }
    if (!passes_walls(mptr)) {
        // C assigns 1 to an unsigned bitfield; js/monst.js and
        // js/makemon_create.js both keep mtrapped as a boolean.
        mtmp.mtrapped = true;
    }
    if (in_sight) {
        await message(
            messageAt(
                `${capitalizedMonsterName(mtmp, state, env)} ${fallverb} into`
                + ` ${a_your[trap.madeby_u ? 1 : 0]} pit!`,
                mtmp.mx,
                mtmp.my,
                state,
            ),
            state,
            env,
        );
        if (mptr === state.mons[PM_PIT_VIPER]
            || mptr === state.mons[PM_PIT_FIEND])
            await message("How pitiful.  Isn't that the pits?", state, env);
        seetrap(trap, env);
    }
    mselftouch(mtmp, 'Falling, ', false, env);
    let relevantSpikes = trap.ttyp === SPIKED_PIT;
    if (wearing_iron_shoes(mtmp, state))
        relevantSpikes = false;
    // C ref: trap.c:2002-2004. The damage roll is thitm()'s argument, so a
    // monster mselftouch() already killed spends no damage roll. Iron shoes
    // make a spiked pit use the ordinary pit damage die.
    const trapkilled = mtmp.mhp < 1 /* DEADMONSTER() */
        || await thitm(0, mtmp, null, random.rnd(relevantSpikes ? 10 : 6), false, env);

    return trapkilled ? Trap_Killed_Mon
        : mtmp.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
}

// C ref: youprop.h:119-120 Hallucination, the bare HALLUC intrinsic minus
// either form of Halluc_resistance. Each file that reads this property defines
// its own copy; see js/pray.js and js/zap.js.
function Hallucination(state) {
    const halluc = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(halluc?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: trap.c domagictrap() (4317-4451). Called from the hero arm of
// trapeffect_magic_trap() when the 1/30 explosion did not fire.
//
// Rolls rnd(20) for `fate` and dispatches across 11 branches:
//   fate < 10: blindness, deafness, monster creation -- refused (needs
//     make_blinded, incr_itimeout, Soundeffect, makemon, wake_nearto).
//   fate 10: no-op.
//   fate 11: toggle HInvis, including self_invis_message() and redraw.
//   fate 12: dofiretrap() -- refused (not ported).
//   fate 13-18: odd-feelings messages, fully ported.
//   fate 19: tame nearby monsters -- refused (needs adjattrib, tamedog).
//   fate 20: uncurse items -- refused (needs seffects with SPE_REMOVE_CURSE).

// C ref: youprop.h:198 Invis, the intrinsic or extrinsic invisibility source
// minus its block; :152 See_invisible has no block term. Each C file spells
// these macros out beside its callers, so domagictrap keeps local copies.
function Invis(state) {
    const property = state.u?.uprops?.[INVIS];
    return Boolean((property?.intrinsic || property?.extrinsic)
        && !property?.blocked);
}

function See_invisible(state) {
    const property = state.u?.uprops?.[SEE_INVIS];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: youprop.h:399 Unaware and pline.c You_hear() (435-451). This local
// composition keeps the trap effect independent from monmove.js, which imports
// trap_effects.js for the monster movement dispatcher.
function heroUnaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || state.u?.uhs === FAINTED);
}

function magicTrapHear(line, state) {
    if ((heroIsDeaf(state) && !heroUnaware(state))
        || !state.flags?.acoustics)
        return null;
    if (state.u?.uinwater) return `You barely hear ${line}`;
    if (heroUnaware(state)) return `You dream that you hear ${line}`;
    return `You hear ${line}`;
}

async function domagictrap(env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const unsupported = requireTrapOperation(env, 'unsupported');

    const fate = random.rnd(20);

    if (fate < 10) {
        // Most of the time, it creates some monsters and blinds/deafens the
        // hero. Needs make_blinded(), incr_itimeout(), Soundeffect(),
        // makemon(), wake_nearto() for the hero arm.
        unsupported('magic trap monster creation');
    } else {
        switch (fate) {
        case 10:
            /* sometimes nothing happens */
            break;
        case 11: /* toggle intrinsic invisibility */
            // Soundeffect(se_low_hum, 100) is a tty-sound hook that writes
            // nothing. You_hear() still applies its Deaf and acoustics gates.
            {
                const heard = magicTrapHear('a low hum.', state);
                if (heard !== null) await message(heard, state);
            }
            const invisProp = state.u.uprops[INVIS];
            if (!Invis(state)) {
                if (!heroIsBlind(state))
                    await self_invis_message(state, { message });
            } else if (!invisProp.extrinsic
                       && !pm_invisible(state.youmonst.data)) {
                if (!heroIsBlind(state)) {
                    if (!See_invisible(state))
                        await message('You can see yourself again!', state);
                    else
                        await message("You can't see through yourself anymore.", state);
                }
            } else {
                await message(
                    `You feel a little more ${invisProp.intrinsic
                        ? 'obvious' : 'hidden'} now.`,
                    state,
                );
            }
            // C preserves any existing HInvis value only when it is false;
            // the true arm clears it before redraw.
            invisProp.intrinsic = invisProp.intrinsic
                ? 0 : invisProp.intrinsic | FROMOUTSIDE;
            requireTrapOperation(env, 'redraw')(
                state.u.ux,
                state.u.uy,
            );
            break;
        case 12: /* a flash of fire */
            // Needs dofiretrap(), which is not ported.
            unsupported('magic trap fire');
            break; // unreachable
        /* odd feelings */
        case 13:
            await message(
                `A shiver runs up and down your ${body_part(SPINE, state.youmonst)}!`,
                state,
            );
            break;
        case 14:
            await message(
                `You hear ${Hallucination(state) ? 'the moon howling at you.' : 'distant howling.'}`,
                state,
            );
            break;
        case 15:
            if (on_level(state.u.uz, state.qstart_level))
                await message(
                    `You feel ${(state.flags.female || (Upolyd(state.u) && is_neuter(state.youmonst.data))) ? 'oddly ' : ''}like the prodigal son.`,
                    state,
                );
            else
                await message(
                    `You suddenly yearn for ${
                        Hallucination(state)
                            ? 'Cleveland'
                            : (In_quest(state.u.uz) || at_dgn_entrance('The Quest', state))
                                  ? 'your nearby homeland'
                                  : 'your distant homeland'
                    }.`,
                    state,
                );
            break;
        case 16:
            await message('Your pack shakes violently!', state);
            break;
        case 17:
            await message(
                `You ${Hallucination(state) ? 'smell hamburgers.' : 'smell charred flesh.'}`,
                state,
            );
            break;
        case 18:
            await message('You feel tired.', state);
            break;
        /* very occasionally something nice happens. */
        case 19: /* tame nearby monsters */
            // Needs adjattrib() and tamedog().
            unsupported('magic trap tame monsters');
            break; // unreachable
        case 20: /* uncurse stuff */
            // Needs seffects() with SPE_REMOVE_CURSE.
            unsupported('magic trap uncurse');
            break; // unreachable
        default:
            break;
        }
    }
}

// C ref: trap.c trapeffect_hole() (2013-2069), including both the hero and
// monster arms. A hero cannot currently enter this arm: preflight_dotrap()
// rejects HOLE and TRAPDOOR before dotrap() changes state. The monster arm is
// live through postmov() and sends ordinary grounded creatures to the
// level-teleport helper below.
async function trapeffect_hole(mtmp, trap, trflags, env) {
    const { state } = env;
    const unsupported = requireTrapOperation(env, 'unsupported');

    if (mtmp === state.youmonst) {
        if (!Can_fall_thru(state.u?.uz, state)) {
            // C reports this through impossible(), which has no terminal or
            // game-state effect. seetrap() still records the trap before that
            // diagnostic, as fall_through() normally would.
            seetrap(trap, env);
            return Trap_Effect_Finished;
        }
        // fall_through() owns the level transition and its arrival screen;
        // that source unit is not ported yet and this hero arm is unreachable
        // through the current movement preflight.
        unsupported('fall_through() from a hole or trap door');
        return Trap_Effect_Finished; // unreachable
    }

    const tt = trap.ttyp;
    const species = mtmp.data;
    const inSight = canSeeMonster(mtmp, state)
        || mtmp === state.u?.usteed;
    const forceTrap = (trflags & FORCETRAP) !== 0;
    const inescapable = forceTrap
        || (state.level?.flags?.sokoban_rules && !trap.madeby_u);

    if (!Can_fall_thru(state.u?.uz, state)) {
        // C's impossible() is diagnostic only; no visible output is emitted.
        return Trap_Effect_Finished;
    }

    const tooLargeOrAirborne = !grounded(species, state)
        || (mtmp.wormno && count_wsegs(mtmp) > 5)
        || species.msize >= MZ_HUGE;
    if (tooLargeOrAirborne) {
        if (forceTrap && !state.level?.flags?.sokoban_rules) {
            if (inSight) {
                seetrap(trap, env);
                await requireTrapOperation(env, 'message')(
                    messageAt(
                        tt === TRAPDOOR
                            ? `A trap door opens, but ${monsterCommonName(mtmp, state)}`
                                + " doesn't fall through."
                            : `${capitalizedMonsterName(mtmp, state)}`
                                + " doesn't fall through the hole.",
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
            }
            return Trap_Effect_Finished;
        }
        if (inescapable) {
            if (inSight) {
                await requireTrapOperation(env, 'message')(
                    messageAt(
                        `${capitalizedMonsterName(mtmp, state)}`
                            + ' seems to be yanked down!',
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
                seetrap(trap, env);
            }
        } else {
            return Trap_Effect_Finished;
        }
    }

    return trapeffect_level_telep(mtmp, trap, trflags, env);
}

// C ref: trap.c trapeffect_telep_trap() (2070-2087). The hero arm is
// reachable through dotrap() when its preflight admits a teleport trap. The
// monster arm always reports Trap_Moved_Mon, even when mtele_trap() declines
// to move a pet because teleportation is restricted.
async function trapeffect_telep_trap(mtmp, trap, _trflags, env) {
    const { state } = env;
    if (mtmp === state.youmonst) {
        seetrap(trap, env);
        await tele_trap(trap, state);
        return Trap_Effect_Finished;
    }

    await mtele_trap(mtmp, trap, canSeeMonster(mtmp, state)
        || mtmp === state.u?.usteed, {
        ...env,
        seeTrap: env.seeTrap ?? ((candidate, operationEnv) =>
            seetrap(candidate, {
                ...operationEnv,
                redraw: env.redraw ?? (() => {}),
            })),
        newsym: env.newsym ?? env.redraw,
    });
    return Trap_Moved_Mon;
}

// C ref: trap.c trapeffect_level_telep() (2088-2105). The monster arm's
// mlevel_tele_trap() return is retained as the string API used by the existing
// teleport helper tests, then translated to trap.c's numeric result code for
// mintrap() and postmov().
async function trapeffect_level_telep(mtmp, trap, trflags, env) {
    const { state } = env;
    if (mtmp === state.youmonst) {
        const unsupported = requireTrapOperation(env, 'unsupported');
        seetrap(trap, env);
        unsupported('level_tele_trap() for the hero');
        return Trap_Effect_Finished; // unreachable
    }

    const result = await mlevel_tele_trap(
        mtmp,
        trap,
        (trflags & FORCETRAP) !== 0,
        canSeeMonster(mtmp, state) || mtmp === state.u?.usteed,
        {
            ...env,
            seeTrap: env.seeTrap ?? ((candidate, operationEnv) =>
                seetrap(candidate, {
                    ...operationEnv,
                    redraw: env.redraw ?? (() => {}),
                })),
            newsym: env.newsym ?? env.redraw,
        },
    );
    return result === 'moved' ? Trap_Moved_Mon : Trap_Effect_Finished;
}

// C ref: trap.c trapeffect_magic_portal() (2710-2724). The hero arm remains
// behind preflight_dotrap(), which excludes MAGIC_PORTAL before dotrap() can
// call feeltrap() or the unported domagicportal(). A monster takes the same
// level-migration path as LEVEL_TELEP, with mlevel_tele_trap() selecting the
// portal-specific endgame gate and MIGR_PORTAL mode.
async function trapeffect_magic_portal(mtmp, trap, trflags, env) {
    const { state } = env;
    if (mtmp === state.youmonst) {
        // Keep the direct selector call explicit as well as the production
        // preflight boundary. C calls feeltrap() before domagicportal(); the
        // latter remains unported, so this branch cannot continue.
        seetrap(trap, env);
        const unsupported = requireTrapOperation(env, 'unsupported');
        unsupported('domagicportal()');
        return Trap_Effect_Finished; // unreachable
    }
    return trapeffect_level_telep(mtmp, trap, trflags, env);
}

// C ref: trap.c trapeffect_fire_trap() (1729-1821), monster arm
// (1738-1819). The hero arm still stops at dofiretrap(), because dotrap()'s
// preflight rejects FIRE_TRAP. The monster arm is live through mintrap() and
// is also the return-valued callee of trapeffect_magic_trap().
async function trapeffect_fire_trap(mtmp, trap, _trflags, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const unsupported = requireTrapOperation(env, 'unsupported');

    if (mtmp === state.youmonst) {
        seetrap(trap, env);
        unsupported('dofiretrap()');
        return Trap_Effect_Finished; // unreachable
    }

    const tx = trap.tx;
    const ty = trap.ty;
    const inSight = canSeeMonster(mtmp, state)
        || mtmp === state.u?.usteed;
    const seeIt = cansee(tx, ty, state);
    let trapkilled = false;
    const species = mtmp.data;
    const origDmg = random.d(2, 4);

    if (inSight) {
        await message(
            messageAt(
                `A tower of flame erupts from the ${surface(mtmp.mx, mtmp.my, state)}`
                + ` under ${mon_nam(mtmp, state)}!`,
                mtmp.mx,
                mtmp.my,
                state,
            ),
            state,
            env,
        );
    } else if (seeIt) {
        // C sets the message coordinate before You_see(); messageAt() carries
        // that same location into the accessible-message representation.
        await message(
            messageAt(
                `You see a tower of flame erupt from the ${surface(mtmp.mx, mtmp.my, state)}!`,
                mtmp.mx,
                mtmp.my,
                state,
            ),
            state,
            env,
        );
    }

    if (monster_resists_element(mtmp, FIRE_RES, state)) {
        if (inSight) {
            // shieldeff() only animates the terminal and has no state or RNG
            // result in this port; preserve the source gap explicitly.
            note_unported('pager.c shieldeff');
            await message(
                messageAt(
                    `${capitalizedMonsterName(mtmp, state)} is uninjured.`,
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
                env,
            );
        }
    } else {
        let num = origDmg;
        let alt = 0;
        let immolate = false;
        switch (species?.pmidx) {
        case PM_PAPER_GOLEM:
            immolate = true;
            alt = mtmp.mhpmax;
            break;
        case PM_STRAW_GOLEM:
            alt = Math.trunc(mtmp.mhpmax / 2);
            break;
        case PM_WOOD_GOLEM:
            alt = Math.trunc(mtmp.mhpmax / 4);
            break;
        case PM_LEATHER_GOLEM:
            alt = Math.trunc(mtmp.mhpmax / 8);
            break;
        default:
            break;
        }
        if (alt > num) num = alt;

        if (await thitm(0, mtmp, null, num, immolate, env)) {
            trapkilled = true;
        } else {
            mtmp.mhpmax -= random.rn2(num + 1);
            if (mtmp.mhp > mtmp.mhpmax)
                mtmp.mhp = mtmp.mhpmax;
        }
    }

    if (await burnarmor(mtmp, env) || random.rn2(3)) {
        const extraDamage = await destroy_items(mtmp, AD_FIRE, origDmg, env);
        await ignite_items(mtmp.minvent, env);
        if (mtmp.mhp >= 1) {
            mtmp.mhp -= extraDamage;
            if (mtmp.mhp < 1) {
                await monkilled(mtmp, '', AD_FIRE, state, env);
                trapkilled = true;
            }
        }
    }

    const burned = await burn_floor_objects(tx, ty, seeIt, false, {
        ...env,
        igniteItems: ignite_items,
    });
    if (burned && !seeIt
        && dist2(tx, ty, state.u.ux, state.u.uy) <= 3 * 3) {
        await message('You smell smoke.', state, env);
    }
    if (is_ice(tx, ty))
        note_unported('zap.c melt_ice()');
    if (mtmp.mhp < 1) trapkilled = true;
    if (seeIt) {
        const currentTrap = t_at(tx, ty, state);
        if (currentTrap) seetrap(currentTrap, env);
    }

    return trapkilled ? Trap_Killed_Mon
        : mtmp.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
}

// C ref: trap.c trapeffect_magic_trap() (2293-2320), both arms.
//
// The hero arm calls seetrap(), rolls rn2(30) for a 1/30 magical-explosion
// branch, and otherwise dispatches to domagictrap(). The 1/30 explosion
// branch calls deltrap() and is refused.
//
async function trapeffect_magic_trap(mtmp, trap, _trflags, env) {
    const { state } = env;
    const random = env.random;
    const unsupported = requireTrapOperation(env, 'unsupported');

    if (mtmp === state.youmonst) {
        seetrap(trap, env);
        if (!random.rn2(30)) {
            // C: deltrap(trap), newsym(), "You are caught in a magical
            // explosion!", losehp(rnd(10)), "Your body absorbs some of the
            // magical energy!", u.uen = (u.uenmax += 2), uenpeak update.
            // deltrap() is not ported.
            unsupported('magic trap explosion');
        } else {
            await domagictrap(env);
        }
        // C line 2313 discards steedintrap()'s return. An unmounted hero
        // takes its no-op guard; a mounted hero gives the effect to its steed.
        await steedintrap(trap, null, env);
        return Trap_Effect_Finished;
    }
    // C:2315-2317. Monsters usually resist magic traps; a zero roll turns the
    // trap into an ordinary fire trap and returns that effect's status.
    if (!random.rn2(21))
        return trapeffect_fire_trap(mtmp, trap, _trflags, env);
    return Trap_Effect_Finished;
}

// C ref: trap.c trapeffect_anti_magic() (2323-2452), monster arm only.
// The hero arm remains behind preflight_dotrap(); callers that reach this
// selector with the hero still get an explicit boundary rather than silently
// taking the monster path.
async function trapeffect_anti_magic(mtmp, trap, _trflags, env) {
    const { state } = env;

    if (mtmp === state.youmonst) {
        const unsupported = requireTrapOperation(env, 'unsupported');
        unsupported('anti-magic trap hero activation');
        return Trap_Effect_Finished; // unreachable
    }

    // Iron shoes protect against an anti-magic trap only while positively
    // enchanted. The monster's inventory update is the only state change in
    // this branch, and C returns before any resistance or damage check.
    if (wearing_iron_shoes(mtmp, state)) {
        const shoes = which_armor(mtmp, W_ARMF, state);
        if (shoes.spe > 0) {
            shoes.spe -= 1;
            update_inventory({ state });
            return Trap_Effect_Finished;
        }
    }

    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const inSight = canSeeMonster(mtmp, state)
        || mtmp === state.u?.usteed;
    const seeIt = cansee(mtmp.mx, mtmp.my, state);
    const species = mtmp.data;

    if (!resists_magm(mtmp, state)) {
        // A cancelled monster, or one without a magical or breath attack,
        // simply walks through the field. C's short circuit preserves the
        // absence of a random call for this common case.
        if (!mtmp.mcan
            && (attacktype(species, AT_MAGC)
                || attacktype(species, AT_BREA))) {
            mtmp.mspec_used = (mtmp.mspec_used ?? 0) + random.d(2, 6);
            if (inSight) {
                seetrap(trap, env);
                await message(
                    messageAt(
                        `${capitalizedMonsterName(mtmp, state)} seems lethargic.`,
                        mtmp.mx,
                        mtmp.my,
                        state,
                    ),
                    state,
                    env,
                );
            }
        }
    } else {
        let damage = random.rnd(4);
        const weapon = mtmp.mw; // MON_WEP(mtmp)

        if (is_art(weapon, ART_MAGICBANE)) damage += random.rnd(4);
        for (let object = mtmp.minvent; object; object = object.nobj) {
            if (object.oartifact
                && defends_when_carried(AD_MAGM, object, state)) {
                damage += random.rnd(4);
                break;
            }
        }
        if (passes_walls(species)) damage = Math.trunc((damage + 3) / 4);

        if (inSight) seetrap(trap, env);
        mtmp.mhp -= damage;
        if (mtmp.mhp < 1) {
            await monkilled(
                mtmp,
                inSight ? 'compression from an anti-magic field' : null,
                -AD_MAGM,
                state,
                env,
            );
        }
        if (mtmp.mhp < 1) {
            if (seeIt) env.redraw(trap.tx, trap.ty);
            return Trap_Killed_Mon;
        }
    }

    return mtmp.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
}

// C ref: trap.c launch_drop_spot() (3222-3233). Marks a spot where a launched
// object should be placed in a bones file so it is not lost mid-flight. The
// port stores the triple on state rather than in a file-scoped global.
function launch_drop_spot(obj, x, y, state) {
    if (!obj) {
        state.launchplace = { obj: null, x: 0, y: 0 };
    } else {
        state.launchplace = { obj, x, y };
    }
}

// C ref: trap.c launch_in_progress() (3235-3241).
export function launch_in_progress(state = game) {
    return Boolean(state.launchplace?.obj);
}

// C ref: trap.c force_launch_placement() (3243-3250).
export function force_launch_placement(state = game) {
    const lp = state.launchplace;
    if (lp?.obj) {
        lp.obj.otrapped = 0;
        place_object(lp.obj, lp.x, lp.y, objectGenerationEnv({ state }));
    }
}

// C ref: trap.c launch_obj() (3260-3575). Moves an object of type otyp from
// (x1,y1) toward (x2,y2). Returns 0 if no object was launched, 1 if launched
// and placed, 2 if launched and used up.
//
// This port covers the rolling path shared by the hero and monster arms. The
// display and message operations are injected so mintrap() can first replay
// the same motion against its planning clone without painting or printing.
async function launch_obj(otyp, x1, y1, x2, y2, style, state, rawEnv = {}) {
    const env = {
        ...rawEnv,
        state,
        random: rawEnv.random ?? { rn2, rnd },
    };
    const planning = Boolean(env.planning);
    const message = env.message ?? ((line, target) =>
        ttyPline(line, target ?? state));
    const redraw = env.redraw ?? ((x, y) => newsym(x, y, state));
    const delayOutput = env.delayOutput
        ?? (planning ? async () => {} : nh_delay_output);
    const temporaryDisplay = env.temporaryDisplay
        ?? (planning ? async () => {} : tmp_at);
    const cursorOnHero = env.cursorOnHero
        ?? (planning ? async () => {} : curs_on_u);
    const youSee = env.youSee ?? ((line, target) => {
        if (heroUnaware(target)) return `You dream that you see ${line}`;
        if (heroIsBlind(target)) return `You sense ${line}`;
        return `You see ${line}`;
    });
    const youHear = env.youHear ?? magicTrapHear;

    // Object lifecycle hooks receive the normalized operation environment,
    // whereas the vision owners take the state directly.  Keep that adapter
    // at this source boundary so removing the launched boulder can set
    // vision_full_recalc before the next C message flushes the map.
    const objectHooks = {
        ...(env.hooks ?? {}),
        blockPoint: env.hooks?.blockPoint
            ?? ((ox, oy, actionEnv) => block_point(
                ox,
                oy,
                actionEnv?.state ?? state,
            )),
        extractExternalObject: env.hooks?.extractExternalObject
            ?? ((object, actionEnv) => remove_object(object, actionEnv)),
        recalcBlockPoint: env.hooks?.recalcBlockPoint
            ?? ((ox, oy, actionEnv) => recalc_block_point(
                ox,
                oy,
                actionEnv?.state ?? state,
            )),
    };

    let otmp = sobj_at(otyp, x1, y1, state);
    // Try the other side too, for rolling boulder traps
    let otherside = false;
    if (!otmp && otyp === BOULDER) {
        otherside = true;
        otmp = sobj_at(otyp, x2, y2, state);
    }
    if (!otmp)
        return 0;
    if (otherside) { // swap 'em
        const tx = x1, ty = y1;
        x1 = x2;
        y1 = y2;
        x2 = tx;
        y2 = ty;
    }

    let singleobj;
    const objectEnv = {
        state,
        hooks: objectHooks,
    };
    if (otmp.quan === 1) {
        obj_extract_self(otmp, objectEnv);
        maybe_unhide_at(otmp.ox, otmp.oy, state);
        singleobj = otmp;
        otmp = null;
    } else {
        singleobj = splitobj(otmp, 1, objectEnv);
        obj_extract_self(singleobj, objectEnv);
    }
    redraw(x1, y1);
    // C: if the boulder is being dug out, clear the dig context. The port does
    // not yet track context.digging, so this is a no-op.

    let dist = distmin(x1, y1, x2, y2);
    let x, y;
    if (!state.bhitpos) state.bhitpos = {};
    x = state.bhitpos.x = x1;
    y = state.bhitpos.y = y1;
    const dx = sgn(x2 - x1);
    const dy = sgn(y2 - y1);
    let delaycnt = 0;
    let used_up = false;

    switch (style) {
    case ROLL | LAUNCH_UNSEEN:
        if (otyp === BOULDER) {
            let announcement;
            if (cansee(x1, y1, state)) {
                announcement = youSee(
                    `${an(xnameFresh(singleobj, state))} start to roll.`,
                    state,
                );
            } else if (Hallucination(state)) {
                note_unported('sounds.c Soundeffect');
                announcement = youHear('someone bowling.', state);
            } else {
                note_unported('sounds.c Soundeffect');
                const nearby = dist2(x1, y1, state.u?.ux, state.u?.uy) <= 16;
                announcement = youHear(
                    `rumbling ${nearby ? 'nearby' : 'in the distance'}.`,
                    state,
                );
            }
            if (announcement)
                await message(announcement, state, env);
        }
        style &= ~LAUNCH_UNSEEN;
        // FALLTHROUGH
    case ROLL | LAUNCH_KNOWN:
        // use otrapped as a flag to ohitmon
        singleobj.otrapped = 1;
        style &= ~LAUNCH_KNOWN;
        // FALLTHROUGH
     
    case ROLL:
        delaycnt = 2;
        // FALLTHROUGH
     
    default:
        if (!delaycnt)
            delaycnt = 1;
        if (!cansee(x, y, state))
            await cursorOnHero(state);
        if (!planning) {
            await temporaryDisplay(DISP_FLASH, obj_to_glyph(singleobj, state,
                rn2_on_display_rng), state);
            await temporaryDisplay(x, y, state);
        }
    }
    // Mark a spot for bones files to prevent loss of object mid-flight.
    launch_drop_spot(singleobj, x, y, state);

    // Set the object in motion
    while (dist-- > 0 && !used_up) {
        if (!planning) await temporaryDisplay(x, y, state);
        let tmp = delaycnt;

        // Delay only if hero sees it
        if (cansee(x, y, state))
            while (tmp-- > 0)
                await delayOutput(state);

        // Bounds check (github issue #1490 fix)
        if (!isok(state.bhitpos.x + dx, state.bhitpos.y + dy)) {
            x2 = x; y2 = y;
            break;
        }

        x = (state.bhitpos.x += dx);
        y = (state.bhitpos.y += dy);

        const mtmp = m_at(x, y, state);
        if (mtmp) {
            if (otyp === BOULDER) {
                if (throws_rocks(mtmp.data) && env.random.rn2(3)) {
                    if (cansee(x, y, state))
                        await message(
                            messageAt(
                                `${capitalizedMonsterName(mtmp, state)}`
                                    + ' snatches the boulder.',
                                x,
                                y,
                                state,
                            ),
                            state,
                            env,
                        );
                    singleobj.otrapped = 0;
                    const pickupEnv = {
                        ...env,
                        state,
                        canSeeMonster: env.canSeeMonster
                            ?? ((subject) => canSeeMonster(subject, state)),
                        hooks: {
                            ...(env.hooks ?? {}),
                            blockPoint: objectHooks.blockPoint,
                            extractExternalObject: objectHooks.extractExternalObject,
                            recalcBlockPoint: objectHooks.recalcBlockPoint,
                        },
                    };
                    if (typeof env.mpickobj === 'function')
                        env.mpickobj(mtmp, singleobj, pickupEnv);
                    else
                        mpickobj(mtmp, singleobj, pickupEnv);
                    used_up = true;
                    launch_drop_spot(null, 0, 0, state);
                    break;
                }
            }
            const hitEnv = {
                ...env,
                state,
                random: env.random,
                monsterAt: env.monsterAt
                    ?? ((mx, my, target) => m_at(mx, my, target)),
                floorEffects: env.floorEffects
                    ?? ((obj, ox, oy, verb, actionEnv) =>
                        obj.otyp === BOULDER ? false
                            : flooreffects(obj, ox, oy, verb, actionEnv)),
                placeObject: env.placeObject
                    ?? ((obj, ox, oy, actionEnv) =>
                        place_object(obj, ox, oy, actionEnv)),
                passiveObject: env.passiveObject ?? (async () => {}),
                shouldMulch: env.shouldMulch ?? (() => false),
                stackObject: env.stackObject
                    ?? ((obj, actionEnv) => stackobj(obj, {
                        ...actionEnv,
                        hooks: {
                            ...(actionEnv.hooks ?? {}),
                            blockPoint: objectHooks.blockPoint,
                            extractExternalObject: objectHooks.extractExternalObject,
                            recalcBlockPoint: objectHooks.recalcBlockPoint,
                        },
                    })),
                hooks: {
                    ...(env.hooks ?? {}),
                    blockPoint: objectHooks.blockPoint,
                    extractExternalObject: objectHooks.extractExternalObject,
                    recalcBlockPoint: objectHooks.recalcBlockPoint,
                },
            };
            if (await ohitmon(
                mtmp,
                singleobj,
                style === ROLL ? -1 : dist,
                false,
                hitEnv,
            )) {
                used_up = true;
                launch_drop_spot(null, 0, 0, state);
                break;
            }
        } else if (u_at(x, y, state)) {
            const dam = dmgval(singleobj, state.youmonst, state, env);

            if (state.multi)
                nomul(0, state);
            if (await thitu(9 + (singleobj.spe || 0),
                    Maybe_Half_Phys(dam, state),
                    singleobj, null, state, {
                        message,
                        losehp: (d, r, k, s) => losehp(d, r, k, s),
                        exercise: (a, b) => exercise(a, b, state),
                        random: { rnd },
                    }))
                await stop_occupation(state, {
                    message,
                });
        }
        if (style === ROLL) {
            // down_gate / ship_object: not reached
            if (typeof state.level?.dnstair?.sx === 'number') {
                // The down_gate check tests for stairs/ladders/portals.
                // Not ported; throw only if the boulder is actually on one.
            }
            const t = t_at(x, y, state);
            if (t && otyp === BOULDER) {
                // C has a switch on t.ttyp for LANDMINE, LEVEL_TELEP,
                // TELEP_TRAP, PIT, SPIKED_PIT, HOLE, TRAPDOOR. The default
                // arm does nothing (break), so traps outside that list are
                // ignored and the boulder keeps rolling.
                switch (t.ttyp) {
                case LANDMINE:
                case LEVEL_TELEP:
                case TELEP_TRAP:
                case PIT:
                case SPIKED_PIT:
                case HOLE:
                case TRAPDOOR:
                    // C stops at a pit or hole after giving the canonical
                    // floor-effects owner the boulder. Its boolean decides
                    // whether the rolling object was consumed.
                    x2 = x;
                    y2 = y;
                    if (await flooreffects(singleobj, x2, y2, 'fall', env)) {
                        used_up = true;
                        launch_drop_spot(null, 0, 0, state);
                    }
                    dist = -1;
                    break;
                default:
                    break;
                }
            }
            if (used_up || dist === -1)
                break;
            // C calls flooreffects() on every rolling square. The owner
            // handles water, lava, pit/hole, and ordinary-floor returns in
            // source order; its boolean controls whether the boulder stops.
            if (await flooreffects(singleobj, x, y, 'fall', env)) {
                used_up = true;
                launch_drop_spot(null, 0, 0, state);
                break;
            }
            if (otyp === BOULDER && sobj_at(BOULDER, x, y, state)) {
                // Boulder-chain collision: not reached in the session.
                throw new Error(
                    'launch_obj boulder-chain collision not yet ported');
            }
        }
        // closed_door: boulder crashes through a door. Not reached.
        if (otyp === BOULDER) {
            const loc = state.level?.at(x, y);
            if (loc && loc.typ === DOOR
                && (loc.doormask & (D_LOCKED | D_CLOSED))) {
                // C: closed_door() check + boulder crashes through door.
                // Not reached in the session.
                throw new Error(
                    'launch_obj boulder-through-door not yet ported');
            }
        }

        // About to hit something ahead?
        if (dist > 0 && isok(x + dx, y + dy)) {
            const fx = x + dx, fy = y + dy;
            const loc = state.level?.at(fx, fy);
            const typ = loc?.typ ?? 0;

            if (typ === IRONBARS) {
                // hits_bars: not ported
                throw new Error(
                    'launch_obj boulder-hits-iron-bars not yet ported');
            } else if (IS_STWALL(typ) || IS_TREE(typ, state)) {
                x2 = x; y2 = y; // object stops here
                if (!heroIsDeaf(state))
                    await message('Thump!');
                wake_nearto(x2, y2, 16, state);
                break;
            }
        }
    } // while dist > 0
    if (!planning) await temporaryDisplay(DISP_END, 0, state);
    launch_drop_spot(null, 0, 0, state);
    if (!used_up) {
        singleobj.otrapped = 0;
        place_object(singleobj, x2, y2, objectEnv);
        redraw(x2, y2);
        return 1;
    }
    return 2;
}

// C ref: trap.c trapeffect_rolling_boulder_trap() (2661-2707). Both arms call
// launch_obj(); the monster arm keeps the result code so mintrap() can tell
// postmov() that a boulder killed or moved its triggerer.
async function trapeffect_rolling_boulder_trap(monster, trap, _trflags, env) {
    const { state } = env;
    const message = requireTrapOperation(env, 'message');
    const redraw = requireTrapOperation(env, 'redraw');

    if (monster === state.youmonst) {
        let style = ROLL | (trap.tseen ? LAUNCH_KNOWN : 0);

        feeltrap(trap, env);
        await message(`${!heroIsDeaf(state) ? 'Click!  ' : ''
            }You trigger a rolling boulder trap!`, state);
        if (!await launch_obj(BOULDER, trap.launch.x, trap.launch.y,
                trap.launch2.x, trap.launch2.y, style, state, env)) {
            // If this is a known trap, use a shorter message.
            if (style & LAUNCH_KNOWN)
                await message('No boulder was released.', state);
            else
                await message(
                    'Fortunately for you, no boulder was released.', state);
        }
    } else {
        const mInAir = requireTrapOperation(env, 'mInAir');
        if (!mInAir(monster, state)) {
            const inSight = monster === state.u?.usteed
                || (cansee(monster.mx, monster.my, state)
                    && canSpotMonster(monster, state));
            const style = ROLL | (inSight ? 0 : LAUNCH_UNSEEN);
            let trapkilled = false;

            redraw(monster.mx, monster.my);
            if (inSight) {
                await message(
                    messageAt(
                        `${!heroIsDeaf(state) ? 'Click!  ' : ''}`
                            + `${capitalizedMonsterName(monster, state)}`
                            + ` triggers ${trap.tseen
                                ? 'a rolling boulder trap' : 'something'}.`,
                        monster.mx,
                        monster.my,
                        state,
                    ),
                    state,
                    env,
                );
            }
            if (await launch_obj(
                BOULDER,
                trap.launch.x,
                trap.launch.y,
                trap.launch2.x,
                trap.launch2.y,
                style,
                state,
                env,
            )) {
                if (inSight) trap.tseen = true;
                trapkilled = monster.mhp < 1;
            }
            return trapkilled ? Trap_Killed_Mon
                : monster.mtrapped ? Trap_Caught_Mon
                    : Trap_Effect_Finished;
        }
    }
    return Trap_Effect_Finished;
}

// C ref: trap.c trapeffect_web() (2106-2276).
export async function trapeffect_web(monster, trap, trflags, env) {
    const { state, random } = env;
    const message = requireTrapOperation(env, 'message');
    const redraw = requireTrapOperation(env, 'redraw');
    const article = a_your[Number(Boolean(trap.madeby_u))];
    if (monster === state.youmonst) {
        let webmsgok = (trflags & NOWEBMSG) === 0;
        const forcetrap = (trflags & (FORCETRAP | FAILEDUNTRAP)) !== 0;
        const viasitting = (trflags & VIASITTING) !== 0;
        const steed = state.u.usteed;
        const steedArticle = steed && has_mgivenname(steed) && !Hallucination(state)
            ? ARTICLE_NONE : ARTICLE_THE;

        feeltrap(trap, env);
        if (await mu_maybe_destroy_web(monster, webmsgok, trap, env))
            return Trap_Effect_Finished;
        if (webmaker(monster.data)) {
            if (webmsgok)
                await message(trap.madeby_u ? 'You take a walk on your web.'
                    : 'There is a spider web here.', state, env);
            return Trap_Effect_Finished;
        }
        if (webmsgok) {
            let verb;
            if (forcetrap || viasitting) {
                verb = 'are caught by';
            } else if (steed) {
                verb = `lead ${x_monnam(steed, steedArticle, 'poor',
                    SUPPRESS_SADDLE, false, state)} into`;
            } else {
                verb = `${u_locomotion('stumble', state)} into`;
            }
            await message(`You ${verb} ${article} spider web!`, state, env);
        }
        set_utrap(1, TT_WEB, state);
        let str = acurr(state, A_STR);
        if (steed && webmsgok) {
            steed.mx = state.u.ux;
            steed.my = state.u.uy;
            // monmove.js imports mintrap(). Resolve its existing owners only
            // at the mounted call, after module initialization has completed.
            const { m_in_air, youHear } = await import('./monmove.js');
            const result = await mintrap(steed, trflags, {
                ...env, mInAir: m_in_air, heroDeaf: heroIsDeaf, youHear,
            });
            if (result !== Trap_Effect_Finished) {
                steed.mtrapped = false;
                if (strongmonst(steed.data)) str = 17;
            } else {
                reset_utrap(false, state);
                return Trap_Effect_Finished;
            }
            webmsgok = false;
        }
        let tim;
        if (str <= 3) tim = random.rn1(6, 6);
        else if (str < 6) tim = random.rn1(6, 4);
        else if (str < 9) tim = random.rn1(4, 4);
        else if (str < 12) tim = random.rn1(4, 2);
        else if (str < 15) tim = random.rn1(2, 2);
        else if (str < 18) tim = random.rnd(2);
        else if (str < 69) tim = 1;
        else {
            tim = 0;
            if (webmsgok)
                await message(`You tear through ${article} web!`, state, env);
            deltrap(trap, state);
            redraw(state.u.ux, state.u.uy);
        }
        set_utrap(tim, TT_WEB, state);
        return Trap_Effect_Finished;
    }

    const inSight = canSeeMonster(monster, state) || monster === state.u.usteed;
    const forcetrap = (trflags & FORCETRAP) !== 0;
    const species = monster.data;
    if (webmaker(species)) return Trap_Effect_Finished;
    if (await mu_maybe_destroy_web(monster, inSight, trap, env))
        return Trap_Effect_Finished;
    let tearWeb = false;
    switch (species.pmidx) {
    case PM_OWLBEAR:
    case PM_BUGBEAR:
        if (!inSight) {
            // Soundeffect(se_roar, 60) has no output in the tty recorder.
            const heard = requireTrapOperation(env, 'youHear')(
                'the roaring of a confused bear!', state,
            );
            if (heard) await message(heard, state, env);
            monster.mtrapped = true;
            break;
        }
        // Falls through to the ordinary visible catch.
    default:
        if (species.mlet === S_GIANT
            || (species.mlet === S_DRAGON && extra_nasty(species))
            || (monster.wormno && count_wsegs(monster, state) > 5)) {
            tearWeb = true;
        } else if (inSight) {
            await message(messageAt(
                `${capitalizedMonsterName(monster, state)}`
                + ` is caught in ${article} spider web.`,
                monster.mx, monster.my, state,
            ), state, env);
            seetrap(trap, env);
        }
        monster.mtrapped = !tearWeb;
        break;
    case PM_TITANOTHERE:
    case PM_BALUCHITHERIUM:
    case PM_PURPLE_WORM:
    case PM_JABBERWOCK:
    case PM_IRON_GOLEM:
    case PM_BALROG:
    case PM_KRAKEN:
    case PM_MASTODON:
    case PM_ORION:
    case PM_NORN:
    case PM_CYCLOPS:
    case PM_LORD_SURTUR:
        tearWeb = true;
        break;
    }
    if (tearWeb) {
        if (inSight)
            await message(messageAt(
                `${capitalizedMonsterName(monster, state)}`
                + ` tears through ${article} spider web!`,
                monster.mx, monster.my, state,
            ), state, env);
        deltrap(trap, state);
        redraw(monster.mx, monster.my);
    } else if (forcetrap && !monster.mtrapped) {
        if (inSight) {
            await message(messageAt(
                `${capitalizedMonsterName(monster, state)}`
                + ` avoids ${article} spider web!`,
                monster.mx, monster.my, state,
            ), state, env);
            seetrap(trap, env);
        }
    }
    return monster.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
}

// Local helper: checks the Deaf property on the hero. youprop.h defines Deaf
// as the intrinsic or the extrinsic of property index 16 (DEAF), plus
// uroleplay.deaf.
function heroIsDeaf(state) {
    const deafProp = state.u?.uprops?.[DEAF];
    return Boolean((deafProp?.intrinsic || deafProp?.extrinsic)
        || state.u?.uroleplay?.deaf);
}

// C ref: mon.c mlifesaver() (2825-2836), in the rust-trap death message.
// `monkilled()` owns the later life-saving operation; this read only selects
// the source's "starts to fall" wording before that call.
function rustTrapMonsterLifesaver(monster, state) {
    if (!nonliving(monster.data) || is_vampshifter(monster)) {
        const amulet = which_armor(monster, W_AMUL, state);
        if (amulet?.otyp === AMULET_OF_LIFE_SAVING) return amulet;
    }
    return null;
}

// C ref: apply.c splash_lit() (1518-1571), the hero-inventory arm reached by
// trap.c water_damage() from trapeffect_rust_trap(). A brass lantern is not
// extinguished by a rust trap unless the hero is actually dunked, which this
// trap path cannot do. The remaining lit-object cases mirror snuff_lit() and
// snuff_candle(), including their source messages.
async function splash_hero_light(obj, env) {
    const { state } = env;
    if (!obj?.lamplit || obj.otyp === BRASS_LANTERN) return false;
    if (obj.otyp === OIL_LAMP
        || obj.otyp === MAGIC_LAMP
        || obj.otyp === POT_OIL) {
        if (!heroIsBlind(state)) {
            await requireTrapOperation(env, 'message')(
                `${Yname2(obj, state)} ${otense(obj, 'go')} out!`,
                state,
                env,
            );
        }
        end_burn(obj, true, objectGenerationEnv(env));
        return true;
    }
    const candle = isCandle(obj);
    if (candle || obj.otyp === CANDELABRUM_OF_INVOCATION) {
        const many = candle
            ? Math.trunc(obj.quan ?? 1) > 1
            : Math.trunc(obj.spe ?? 0) > 1;
        if (!heroIsBlind(state)) {
            const kind = candle ? 'candle' : "candelabrum's candle";
            await requireTrapOperation(env, 'message')(
                `Your ${kind}${many ? "s'" : "'s"} flame`
                    + `${many ? 's are' : ' is'} extinguished.`,
                state,
                env,
            );
        }
        end_burn(obj, true, objectGenerationEnv(env));
        return true;
    }
    return false;
}

// C ref: trap.c trapeffect_rust_trap() (1594-1727), both hero and monster
// arms. The two arms deliberately share the source's rn2(5) split but differ
// in target selection: hero traps hit the selected worn object even when it
// is not rust-prone, while monster traps use water_damage()'s worn-equipment
// adapter and MON_WEP().
export async function trapeffect_rust_trap(mtmp, trap, _trflags, env) {
    const { state, random } = env;
    const message = requireTrapOperation(env, 'message');
    const hero = mtmp === state.youmonst;
    const damage = hero
        ? (obj, description) => water_damage(
            obj,
            description,
            true,
            { ...env, splashLight: splash_hero_light },
        )
        : (obj, description) => water_damage_monster_equipment(
            obj,
            description,
            env,
        );

    if (hero) {
        seetrap(trap, env);
        // Unlike monsters, traps cannot aim their rust attacks at the hero;
        // every case therefore uses the selected object, even when it is
        // absent or not rust-prone.
        switch (random.rn2(5)) {
        case 0:
            await message(
                `${'A gush of water hits'} you on the ${body_part(HEAD, state.youmonst)}!`,
                state,
                env,
            );
            await damage(state.uarmh, helm_simple_name(state.uarmh, state));
            break;
        case 1:
            await message(
                `${'A gush of water hits'} your left ${body_part(ARM, state.youmonst)}!`,
                state,
                env,
            );
            if (await damage(state.uarms, 'shield') !== ER_NOTHING)
                break;
            if (state.u.twoweap || (state.uwep && bimanual(state.uwep, state))) {
                const weapon = state.u.twoweap ? state.uswapwep : state.uwep;
                await damage(weapon, null);
            }
            // C's goto uglovecheck lands here after the optional weapon hit.
            await damage(state.uarmg, gloves_simple_name(state.uarmg, state));
            break;
        case 2:
            await message(
                `${'A gush of water hits'} your right ${body_part(ARM, state.youmonst)}!`,
                state,
                env,
            );
            await damage(state.uwep, null);
            await damage(state.uarmg, gloves_simple_name(state.uarmg, state));
            break;
        default: {
            await message('A gush of water hits you!', state, env);
            // Exclude primary and secondary weapons because cases 1 and 2
            // target them through water_damage(). Save nobj before the call;
            // C does the same because splash_lit() may alter the list.
            for (let obj = state.invent; obj;) {
                const next = obj.nobj;
                if (obj.lamplit && obj !== state.uwep
                    && (obj !== state.uswapwep || !state.u.twoweap)) {
                    await splash_hero_light(obj, env);
                }
                obj = next;
            }
            if (state.uarmc)
                await damage(state.uarmc, cloak_simple_name(state.uarmc, state));
            else if (state.uarm)
                await damage(state.uarm, suit_simple_name(state.uarm, state));
            else if (state.uarmu)
                await damage(state.uarmu, 'shirt');
            break;
        }
        }
        update_inventory({ state });

        if (state.u.umonnum === PM_IRON_GOLEM) {
            const dam = state.u.mhmax ?? state.youmonst.mhpmax ?? 0;
            await message('You are covered with rust!', state, env);
            await losehp(
                Maybe_Half_Phys(dam, state),
                'rusting away',
                KILLED_BY,
                state,
            );
        } else if (state.u.umonnum === PM_GREMLIN && random.rn2(3)) {
            note_unported('potion.c split_mon');
        }
        return Trap_Effect_Finished;
    }

    const inSight = canSeeMonster(mtmp, state) || mtmp === state.u?.usteed;
    const mptr = mtmp.data;
    let trapkilled = false;
    if (inSight) seetrap(trap, env);

    switch (random.rn2(5)) {
    case 0: {
        if (inSight)
            await message(messageAt(
                `A gush of water hits ${mon_nam(mtmp, state)} on the `
                    + `${mbodypart(mtmp, HEAD)}!`,
                mtmp.mx,
                mtmp.my,
                state,
            ), state, env);
        const target = which_armor(mtmp, W_ARMH, state);
        await damage(target, helm_simple_name(target, state));
        break;
    }
    case 1: {
        if (inSight)
            await message(messageAt(
                `A gush of water hits ${mon_nam(mtmp, state)}'s left ${mbodypart(mtmp, ARM)}!`,
                mtmp.mx,
                mtmp.my,
                state,
            ), state, env);
        let target = which_armor(mtmp, W_ARMS, state);
        if (await damage(target, 'shield') !== ER_NOTHING) break;
        target = mtmp.mw;
        if (target && bimanual(target, state))
            await damage(target, null);
        target = which_armor(mtmp, W_ARMG, state);
        await damage(target, gloves_simple_name(target, state));
        break;
    }
    case 2: {
        if (inSight)
            await message(messageAt(
                `A gush of water hits ${mon_nam(mtmp, state)}'s right ${mbodypart(mtmp, ARM)}!`,
                mtmp.mx,
                mtmp.my,
                state,
            ), state, env);
        await damage(mtmp.mw, null);
        const target = which_armor(mtmp, W_ARMG, state);
        await damage(target, gloves_simple_name(target, state));
        break;
    }
    default: {
        if (inSight)
            await message(messageAt(
                `A gush of water hits ${mon_nam(mtmp, state)}!`,
                mtmp.mx,
                mtmp.my,
                state,
            ), state, env);
        for (let obj = mtmp.minvent; obj; obj = obj.nobj) {
            if (obj.lamplit
                && (obj.owornmask & (W_WEP | W_SWAPWEP)) === 0) {
                await splash_monster_light(obj, env);
            }
        }
        let target = which_armor(mtmp, W_ARMC, state);
        if (target)
            await damage(target, cloak_simple_name(target, state));
        else if ((target = which_armor(mtmp, W_ARM, state)))
            await damage(target, suit_simple_name(target, state));
        else if ((target = which_armor(mtmp, W_ARMU, state)))
            await damage(target, 'shirt');
        break;
    }
    }

    if (completelyrusts(mptr)) {
        if (inSight)
            await message(messageAt(
                `${capitalizedMonsterName(mtmp, state)} ${rustTrapMonsterLifesaver(mtmp, state)
                    ? 'starts to fall' : 'falls'} to pieces!`,
                mtmp.mx,
                mtmp.my,
                state,
            ), state, env);
        await monkilled(mtmp, null, AD_RUST, state, env);
        if (mtmp.mhp < 1) trapkilled = true;
    } else if (mptr?.pmidx === PM_GREMLIN && random.rn2(3)) {
        note_unported('potion.c split_mon');
    }

    return trapkilled ? Trap_Killed_Mon
        : mtmp.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
}

// C ref: trap.c blow_up_landmine() (3170-3219). The explosion's scatter and
// liquid-flow item/monster effects belong to explode.c, dig.c and apply.c;
// this caller owns the terrain, trap, engraving, wake-up and vision effects
// that follow the discarded calls in C.
export async function blow_up_landmine(trap, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const x = trap.tx;
    const y = trap.ty;
    const location = state.level?.at?.(x, y);
    if (!location) return;

    const env = { ...rawEnv, state };
    const random = env.random ?? { d, rn1, rn2, rnd, rne };
    const oldTyp = location.typ;

    // C discards scatter()'s return value. Its side effects are fully ported,
    // so keep the call (including its random and object hooks) in source order.
    await scatter(
        x,
        y,
        4,
        SCATTER_MAY_DESTROY | SCATTER_MAY_HIT | SCATTER_MAY_FRACTURE
            | SCATTER_VIS_EFFECTS,
        null,
        state,
        {
            ...env,
            random,
            // explode.c scatter() reads `newsym`; the planning env exposes
            // the same redraw operation under that seam.
            newsym: env.newsym ?? env.redraw
                ?? ((rx, ry) => newsym(rx, ry, state)),
        },
    );
    del_engr_at(x, y, state);
    await wake_nearto(x, y, 400, env);

    if (IS_DOOR(location.typ))
        location.doormask = D_BROKEN;

    // destroy_drawbridge() still has no implementation. C discards its
    // result, so record the call only after the source lookup succeeds.
    if (location.typ === DRAWBRIDGE_DOWN
        || is_drawbridge_wall(x, y, state) >= 0) {
        const bridge = { x, y };
        if (find_drawbridge(bridge, state))
            note_unported('dbridge.c destroy_drawbridge');
    }

    const remaining = t_at(x, y, state);
    if (remaining) {
        const level = state.u?.uz;
        const waterLevel = state.water_level;
        const airLevel = state.air_level;
        const isWaterLevel = Boolean(level && waterLevel
            && level.dnum === waterLevel.dnum
            && level.dlevel === waterLevel.dlevel);
        const isAirLevel = Boolean(level && airLevel
            && level.dnum === airLevel.dnum
            && level.dlevel === airLevel.dlevel);
        if (isWaterLevel || isAirLevel) {
            // C calls deltrap() here and discards its result. deltrap() is
            // complete for ordinary levels and the trap is gone in either
            // water or air, matching the source.
            deltrap(remaining, state);
        } else {
            // fillholetyp() is a shared source helper. Keep this lazy import
            // to avoid pulling dig.c's monmove edge into this module cycle.
            const { fillholetyp } = await import('./dig.js');
            const typ = fillholetyp(x, y, false, state, { rn2: random.rn2 });
            if (typ !== ROOM) {
                location.typ = typ;
                // liquid_flow()'s return is discarded by C. Its item and
                // monster damage effects are not ported, so record and skip
                // that callee without inventing a trap deletion or message.
                note_unported('dig.c liquid_flow');
            } else {
                remaining.ttyp = PIT;
                remaining.madeby_u = false;
                seetrap(remaining, {
                    ...env,
                    redraw: env.redraw ?? ((rx, ry) => newsym(rx, ry, state)),
                });
            }
        }
    }

    fill_pit(x, y, state);
    // C discards maybe_dunk_boulders(); the helper remains unported.
    note_unported('apply.c maybe_dunk_boulders');
    recalc_block_point(x, y, state);
    spot_checks(x, y, oldTyp, state, env);
}

// C ref: trap.c trapeffect_landmine() (2527-2658). The hero and monster arms
// share the damage roll and then follow their source-specific trigger paths.
export async function trapeffect_landmine(mtmp, trap, trflags, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const random = env.random ?? { d, rn1, rn2, rnd, rne, rnl };
    const message = requireTrapOperation(env, 'message');
    const damageBase = random.rnd(16);
    const damage = wearing_iron_shoes(mtmp, state)
        ? Math.trunc((damageBase + 3) / 4) : damageBase;

    if (mtmp === state.youmonst) {
        let steedMid = 0;
        let saddle = null;
        const alreadySeen = Boolean(trap.tseen);
        const forcetrap = (trflags & FORCETRAP) !== 0
            || (trflags & FAILEDUNTRAP) !== 0;
        const forcebungle = (trflags & FORCEBUNGLE) !== 0;

        if ((Levitation(state) || Flying(state)) && !forcetrap) {
            if (!alreadySeen && random.rn2(3))
                return Trap_Effect_Finished;
            feeltrap(trap, env);
            await message(
                `${alreadySeen ? 'There is' : 'You discover'} `
                    + `${trap.madeby_u ? 'the trigger of your mine' : 'a trigger'}`
                    + ' in a pile of soil below you.',
                state,
                env,
            );
            if (alreadySeen && random.rn2(3))
                return Trap_Effect_Finished;
            // C's Soundeffect() is terminal-only and has no captured state;
            // preserve the source call as a named gap before the pline.
            note_unported('sounds.c Soundeffect');
            await message(
                `KAABLAMM!!!  ${forcebungle ? 'Your inept attempt sets'
                    : 'The air currents set'}${alreadySeen
                    ? ` ${a_your[Number(Boolean(trap.madeby_u))]} land mine`
                    : ' it'} off!`,
                state,
                env,
            );
        } else {
            // C's static guard protects the steed-dismount recursion. A state
            // field gives the same lifetime for one game without a module
            // global shared by concurrent game instances.
            if (state.trapRecursiveMine)
                return Trap_Effect_Finished;
            feeltrap(trap, env);
            await message(
                `KAABLAMM!!!  You triggered ${a_your[
                    Number(Boolean(trap.madeby_u))
                ]} land mine!`,
                state,
                env,
            );
            steedMid = state.u.usteed?.m_id ?? 0;
            state.trapRecursiveMine = true;
            try {
                await steedintrap(trap, null, env);
            } finally {
                state.trapRecursiveMine = false;
            }
            // C performs this lookup after steedintrap(), then keeps the
            // saddle only if that call killed the mounted steed.
            saddle = sobj_at(SADDLE, state.u.ux, state.u.uy, state);
            await set_wounded_legs(LEFT_SIDE, random.rn1(35, 41), state);
            await set_wounded_legs(RIGHT_SIDE, random.rn1(35, 41), state);
            await exercise(A_DEX, false, state, random, {
                encumberMessage: (subject) => encumber_msg(subject),
            });
        }

        // Add the pit before losehp(), exactly as C does for bones handling.
        trap.ttyp = PIT;
        trap.madeby_u = false;
        await losehp(
            Maybe_Half_Phys(damage, state),
            'land mine',
            KILLED_BY_AN,
            state,
            env,
        );
        await blow_up_landmine(trap, env);
        if (steedMid && saddle && !state.u.usteed)
            note_unported('trap.c keep_saddle_with_steedcorpse');
        newsym(state.u.ux, state.u.uy, state);
        const nextTrap = t_at(state.u.ux, state.u.uy, state);
        if (nextTrap)
            await dotrap(nextTrap, RECURSIVETRAP, state);
        fill_pit(state.u.ux, state.u.uy, state);
        return Trap_Effect_Finished;
    }

    const mInAir = requireTrapOperation(env, 'mInAir');
    const heroDeaf = requireTrapOperation(env, 'heroDeaf');
    const inSight = canSeeMonster(mtmp, state) || mtmp === state.u?.usteed;
    const tx = trap.tx;
    const ty = trap.ty;
    const triggerWeight = Math.trunc(mtmp.data?.cwt ?? 0);
    if (random.rn2(triggerWeight + 1) < WT_ELF / 2)
        return Trap_Effect_Finished;

    if (mInAir(mtmp, state)) {
        const alreadySeen = Boolean(trap.tseen);
        if (inSight && !alreadySeen) {
            await message(
                messageAt(
                    `A trigger appears in a pile of soil below ${mon_nam(mtmp, state, env)}.`,
                    mtmp.mx,
                    mtmp.my,
                    state,
                ),
                state,
                env,
            );
            seetrap(trap, env);
        }
        if (random.rn2(3))
            return Trap_Effect_Finished;
        if (inSight) {
            requireTrapOperation(env, 'redraw')(mtmp.mx, mtmp.my);
            await message(
                // C uses pline_The(), which leaves the message unpositioned;
                // this differs from the preceding pline_mon() line.
                `The air currents set ${alreadySeen ? 'a land mine' : 'it'} off!`,
                state,
                env,
            );
        }
    } else if (inSight) {
        requireTrapOperation(env, 'redraw')(mtmp.mx, mtmp.my);
        await message(
            messageAt(
                `${heroDeaf(state) ? '' : 'KAABLAMM!!!  '}`
                    + `${capitalizedMonsterName(mtmp, state, env)} triggers`
                    + ` ${a_your[Number(Boolean(trap.madeby_u))]} land mine!`,
                mtmp.mx,
                mtmp.my,
                state,
            ),
            state,
            env,
        );
    }
    if (!inSight && !heroDeaf(state))
        await message('Kaablamm!  You hear an explosion in the distance!', state, env);

    await blow_up_landmine(trap, env);
    let trapkilled = mtmp.mhp < 1;
    if (!trapkilled)
        trapkilled = await thitm(0, mtmp, null, damage, false, env);
    if (!trapkilled) {
        const result = await mintrap(mtmp, trflags | FORCETRAP, env);
        if (result === Trap_Killed_Mon)
            trapkilled = true;
    }
    fill_pit(tx, ty, state);
    if (mtmp.mhp < 1) trapkilled = true;
    if (unconscious(state)) {
        state.multi = -1;
        state.nomovemsg = 'The explosion awakens you!';
    }
    return trapkilled ? Trap_Killed_Mon
        : mtmp.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
}

// The trap types whose trapeffect_*() body has no arm in the port yet. C
// dispatches all of them; each stops the scan before the effect changes state,
// draws, or writes a message. BEAR_TRAP, DART_TRAP, MAGIC_TRAP and SLP_GAS_TRAP
// are absent because their hero arms are ported. ROCKTRAP is absent for the
// mirror reason: its monster arm is ported and its own body refuses the hero
// arm. PIT and SPIKED_PIT both dispatch to the complete trapeffect_pit() body;
// hero preflight admits those two trap types directly.
const UNPORTED_TRAP_EFFECTS = Object.freeze(new Set([
    ARROW_TRAP,
    POLY_TRAP,
    VIBRATING_SQUARE,
]));

// C ref: trap.c trapeffect_statue_trap() (2279-2292). The hero arm still
// stops at activate_statue_trap(), which is outside this span; monsters do
// not trigger statue traps and finish without output, RNG, or state changes.
async function trapeffect_statue_trap(mtmp, _trap, _trflags, env) {
    if (mtmp === env.state.youmonst) {
        requireTrapOperation(env, 'unsupported')('trap activation');
    }
    return Trap_Effect_Finished;
}

// C ref: trap.c trapeffect_selector() (2936-2992). C's default arm calls
// impossible() for a type outside the switch; the port throws instead, since
// impossible() is not ported and a type outside 1..TRAPNUM-1 means the trap
// list is corrupt.
export async function trapeffect_selector(monster, trap, trflags, env) {
    const unsupported = requireTrapOperation(env, 'unsupported');
    if (trap.ttyp === SQKY_BOARD)
        return trapeffect_sqky_board(monster, trap, trflags, env);
    if (trap.ttyp === RUST_TRAP)
        return trapeffect_rust_trap(monster, trap, trflags, env);
    if (trap.ttyp === DART_TRAP)
        return trapeffect_dart_trap(monster, trap, trflags, env);
    if (trap.ttyp === ROCKTRAP)
        return trapeffect_rocktrap(monster, trap, trflags, env);
    if (trap.ttyp === BEAR_TRAP)
        return trapeffect_bear_trap(monster, trap, trflags, env);
    if (trap.ttyp === PIT || trap.ttyp === SPIKED_PIT)
        return trapeffect_pit(monster, trap, trflags, env);
    if (trap.ttyp === FIRE_TRAP)
        return trapeffect_fire_trap(monster, trap, trflags, env);
    if (trap.ttyp === MAGIC_TRAP)
        return trapeffect_magic_trap(monster, trap, trflags, env);
    if (trap.ttyp === ANTI_MAGIC)
        return trapeffect_anti_magic(monster, trap, trflags, env);
    if (trap.ttyp === SLP_GAS_TRAP)
        return trapeffect_slp_gas_trap(monster, trap, trflags, env);
    if (trap.ttyp === HOLE || trap.ttyp === TRAPDOOR)
        return trapeffect_hole(monster, trap, trflags, env);
    if (trap.ttyp === LEVEL_TELEP)
        return trapeffect_level_telep(monster, trap, trflags, env);
    if (trap.ttyp === MAGIC_PORTAL)
        return trapeffect_magic_portal(monster, trap, trflags, env);
    if (trap.ttyp === TELEP_TRAP)
        return trapeffect_telep_trap(monster, trap, trflags, env);
    if (trap.ttyp === WEB)
        return trapeffect_web(monster, trap, trflags, env);
    if (trap.ttyp === STATUE_TRAP)
        return trapeffect_statue_trap(monster, trap, trflags, env);
    if (trap.ttyp === LANDMINE)
        return trapeffect_landmine(monster, trap, trflags, env);
    if (trap.ttyp === ROLLING_BOULDER_TRAP)
        return trapeffect_rolling_boulder_trap(monster, trap, trflags, env);
    if (UNPORTED_TRAP_EFFECTS.has(trap.ttyp)) unsupported('trap activation');
    throw new Error(`trapeffect_selector: strange trap type ${trap.ttyp}`);
}

// Everything dotrap() and its trapeffect_*() hero arms cannot answer, asked
// before the hero commits to the square so that no refusal lands after a draw
// or a state change. hack.c requireSimpleHeroDestination() calls this ahead of
// the move, and dotrap() calls it again as its first statement for any caller
// that arrives another way.
//
// The stops, and what each of them needs:
//   every type but BEAR_TRAP, DART_TRAP, MAGIC_TRAP, SLP_GAS_TRAP, RUST_TRAP,
//     LANDMINE, PIT, SPIKED_PIT, TELEP_TRAP, WEB and ROLLING_BOULDER_TRAP --
//     its own trapeffect_*() arm;
//   a magic-resistant hero on a teleport trap -- shieldeff(), a tmp_at()
//     animation, at teleport.c:1503;
//   a fixed-destination teleport trap with a monster standing on the
//     destination -- teleport.c:1516's rloc_to(), whose port covers only a
//     monster that is not yet on the map;
//   a trap other than WEB, PIT and SPIKED_PIT the hero has already seen -- the
//     "You step over ..." line at trap.c:3028 and the "You escape ..." line at
//     :3039 are outside those effects;
//   a mounted hero -- s_suffix(mon_nam()) and mbodypart() at trap.c:1508-1509
//     (bear trap), while steedintrap() handles the dart, gas, magic, landmine
//     and pit arms admitted below;
//   iron shoes -- Yname2(uarmf), at trap.c:1518 (bear trap only).
export function preflight_dotrap(trap, state = game, trflags = 0) {
    const pitTrap = is_pit(trap.ttyp);
    if (trap.ttyp !== BEAR_TRAP && trap.ttyp !== DART_TRAP
        && trap.ttyp !== MAGIC_TRAP && trap.ttyp !== SLP_GAS_TRAP
        && trap.ttyp !== RUST_TRAP && trap.ttyp !== TELEP_TRAP
        && trap.ttyp !== LANDMINE && !pitTrap
        && trap.ttyp !== WEB
        && trap.ttyp !== ROLLING_BOULDER_TRAP)
        throw new UnsupportedHeroMoveBoundaryError('trap activation');
    if (trap.ttyp === TELEP_TRAP) {
        const antimagic = state.u?.uprops?.[ANTIMAGIC];
        if (antimagic?.intrinsic || antimagic?.extrinsic) {
            throw new UnsupportedHeroMoveBoundaryError(
                'shieldeff() for a magic-resistant hero on a teleport trap',
            );
        }
        // tele_trap()'s fixed-destination arm calls settrack() before it can
        // discover that rloc_to() has no answer for the monster in the way,
        // so the question has to be asked here, ahead of that write.
        if (!trap.once && fixed_tele_trap(trap)
            && m_at(trap.teledest.x, trap.teledest.y, state)) {
            throw new UnsupportedHeroMoveBoundaryError(
                'a monster on a teleport trap destination',
            );
        }
    }
    if (trap.tseen && trap.ttyp !== WEB && trap.ttyp !== LANDMINE
        && !pitTrap) {
        throw new UnsupportedHeroMoveBoundaryError(
            'a trap the hero has already seen',
        );
    }
    if (state.u.usteed && trap.ttyp !== WEB
        && trap.ttyp !== LANDMINE && trap.ttyp !== DART_TRAP
        && trap.ttyp !== SLP_GAS_TRAP && trap.ttyp !== MAGIC_TRAP
        && !pitTrap) {
        // trap.c:1507-1511 names a bear-trap steed through
        // s_suffix(mon_nam()) and mbodypart(); the other mounted arms call
        // steedintrap() and are admitted above.
        throw new UnsupportedHeroMoveBoundaryError(
            trap.ttyp === BEAR_TRAP
                ? 'a bear trap closing on a steed'
                : 'a steed in a trap',
        );
    }
    if (trap.ttyp === BEAR_TRAP
        && wearing_iron_shoes(state.youmonst, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'iron shoes in a bear trap',
        );
    }
}

// C ref: trap.c dotrap() (2995-3060). The hero's counterpart to mintrap():
// hack.c spoteffects() calls it for the trap under the hero's feet. The pit
// and spiked-pit arms are admitted here because trapeffect_pit() is complete.
export async function dotrap(trap, trflags, state = game) {
    // First, and before nomul(0): a refusal has to precede the state change,
    // not follow it.
    preflight_dotrap(trap, state, trflags);

    const u = state.u;
    const ttype = trap.ttyp;
    const already_seen = trap.tseen;
    const plunged = (trflags & TOOKPLUNGE) !== 0;
    const conjPit = conjoined_pits(
        trap,
        t_at(state.u.ux0, state.u.uy0, state),
        true,
        state,
    );
    const adjPit = adj_nonconjoined_pit(trap, state);
    const env = heroTrapEnv(state);
    let flags = trflags;
    let forcetrap = (flags & FORCETRAP) !== 0 || (flags & FAILEDUNTRAP) !== 0;

    nomul(0, state);

    if (fixed_tele_trap(trap)) {
        flags |= FORCETRAP;
        forcetrap = true;
    }

    /* KMH -- You can't escape the Sokoban level traps */
    if (state.level?.flags?.sokoban_rules
        && (is_pit(ttype) || is_hole(ttype))) {
        // trap.c:3021-3023. TRUE forces "pit" for a hallucinating hero and
        // trapname() keeps its display-RNG call in the source position.
        await env.message(
            `Air currents pull you down into ${a_your[Number(Boolean(trap.madeby_u))]}`
                + ` ${trapname(ttype, true, state)}!`,
            state,
        );
        /* then proceed to normal trap effect */
    } else if (!forcetrap) {
        if (floor_trigger(ttype)
            && check_in_air(state.youmonst, flags, state)) {
            // trap.c:3027-3032. A hero who floats or flies over a seen trap
            // is told so; an unseen trap is silently crossed.
            if (already_seen) {
                await env.message(
                    `You ${u_locomotion('step', state)} over `
                        + `${a_your[Number(Boolean(trap.madeby_u))]} `
                        + `${trapname(ttype, false, state)}.`,
                    state,
                );
            }
            return;
        }
        const fumbling = u.uprops?.[FUMBLING];
        const isFumbling = fumbling?.intrinsic || fumbling?.extrinsic;
        if (already_seen && !isFumbling && !undestroyable_trap(ttype)
            && ttype !== ANTI_MAGIC && !(flags & FORCEBUNGLE)
            && !plunged && !conjPit && !adjPit
            // C evaluates rn2(5) before checking the clinger exception.
            && (!env.random.rn2(5)
                || (is_pit(ttype) && is_clinger(state.youmonst.data)))) {
            await env.message(
                `You escape ${a_your[Number(Boolean(trap.madeby_u))]}`
                    + ` ${trapname(ttype, false, state)}.`,
                state,
            );
            return;
        }
    }

    if (u.usteed) mon_learns_traps(u.usteed, ttype);
    mons_see_trap(trap, {
        state,
        mCansee: (subject, x, y) => clear_path(subject.mx, subject.my, x, y),
    });

    /*
     * Note:
     *  Most references to trap types here don't use trapname() for
     *  hallucination.  This could be considered to be a bug but doing
     *  that would hide the actual trap situation from the player which
     *  would be somewhat harsh for what's usually a minor impairment.
     */

    await trapeffect_selector(state.youmonst, trap, flags, env);
}

// C ref: trap.c mintrap() (3732-3840). Covers the wrapper's `!trap` arm, the
// BEAR_TRAP-reachable subset of its `mtmp->mtrapped` arm, every gate of its
// `!mtmp->mtrapped` arm, and the dispatch into trapeffect_selector().
export async function mintrap(monster, mintrapflags, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    const unsupported = requireTrapOperation(env, 'unsupported');
    const trap = t_at(monster.mx, monster.my, state);
    const species = monster.data;

    if (!trap) {
        // C assigns 0 to an unsigned bitfield; js/monst.js and
        // js/makemon_create.js both keep mtrapped as a boolean.
        monster.mtrapped = false; /* perhaps teleported? */
        return Trap_Effect_Finished;
    }
    // Checked here rather than on entry because C makes no draw for a monster
    // standing on no trap, and postmov() calls this on every completed move.
    // Everything the admitted path can need is proven present here, before the
    // first write or draw: seetrap() and trapeffect_sqky_board() used to
    // resolve their own owners, which put those throws after mintrap() had
    // already written mtrapseen and spent rnl(5), and after the squeak had
    // been emitted. A refusal has to precede the state change, not follow it.
    // The random set covers every operation trapeffect_selector() can dispatch
    // to, not only mintrap()'s own rn2(4) and rnl(5): the dart arm reaches
    // mksobj() and next_ident(), which need rn1, rnd and rne, while the fire
    // and anti-magic trap arms need d(). Proving these owners here rather than
    // in the arm matters, because the arm runs after
    // mon_learns_traps() has written mtrapseen on the victim and every
    // onlooker, and after the rn2(4) and rnl(5) gates may have drawn -- so a
    // late proof would refuse with state already changed, and with a bare
    // TypeError that ELAPSED_TURN_PLANNING_REFUSALS does not convert.
    const random = env.random;
    const tt = trap.ttyp;
    const randomNames = ['rn1', 'rn2', 'rnd', 'rne', 'rnl'];
    if (tt === FIRE_TRAP || tt === MAGIC_TRAP || tt === ANTI_MAGIC)
        randomNames.push('d');
    for (const name of randomNames)
        if (typeof random?.[name] !== 'function')
            throw new TypeError(`mintrap requires ${randomNames.join(', ')}`);
    for (const name of ['redraw', 'mInAir', 'heroDeaf', 'youHear'])
        requireTrapOperation(env, name);
    const message = requireTrapOperation(env, 'message');

    if (monster.mtrapped) { /* is currently in the trap */
        // C ref: trap.c:3741-3789. Two of the arm's blocks are unreachable for
        // a bear trap and are refused here, ahead of seetrap()'s write and of
        // the rn2(40) below, rather than ported.
        //
        // A pit takes C's second escape disjunct, `is_pit(trap->ttyp) &&
        // m_easy_escape_pit(mtmp)` at 3751, and with it the boulder block at
        // 3752-3758, which needs sobj_at(BOULDER) and fill_pit(); its escape
        // line at 3768-3769 needs m_easy_escape_pit() as well. For BEAR_TRAP
        // is_pit() is false throughout, so C's `||` short-circuits past the
        // second disjunct and the boulder block cannot be entered.
        if (is_pit(tt)) unsupported('a monster escaping a pit');

        // 3742-3749. Seeing a held monster reveals what holds it. C's
        // disjunction admits a pit, a bear trap, a hole and a web. Only the
        // pit refusal precedes this test, so a hole and a web reach it and
        // seetrap() runs for them too. The escape-message refusal below is no
        // general fence for the rest: it sits inside the `!rn2(40)` roll and
        // the visibility test, so a monster held on an unported type that
        // fails the roll -- 39 turns in 40 -- runs to the return having passed
        // seetrap() with no stop at all. A general fence would have to sit
        // above this line.
        if (!trap.tseen && cansee(monster.mx, monster.my, state)
            && canSeeMonster(monster, state)
            && (is_pit(tt) || tt === BEAR_TRAP || tt === HOLE || tt === WEB))
            seetrap(trap, env);

        if (!random.rn2(40)) {
            if (canSeeMonster(monster, state)) {
                // 3766-3773. The pit arm is gone with is_pit() above. C's
                // remaining `else if` writes nothing at all for a trap that is
                // neither a bear trap nor a web, yet still calls set_msg_xy();
                // messageAt() positions one composed line and cannot leave
                // that cursor hint standing for whatever prints next, so the
                // silent case stops instead of diverging on the following
                // message's position.
                if (tt !== BEAR_TRAP && tt !== WEB)
                    unsupported('a monster escaping a trap silently');
                await message(
                    messageAt(
                        `${capitalizedMonsterName(monster, state)} pulls free`
                        + ` of the ${trapname(tt, false, state)}.`,
                        monster.mx,
                        monster.my,
                        state,
                    ),
                    state,
                    env,
                );
            }
            // C assigns 0 to an unsigned bitfield; js/monst.js and
            // js/makemon_create.js both keep mtrapped as a boolean.
            monster.mtrapped = false;
        } else if (metallivorous(species)
            && (tt === BEAR_TRAP || tt === SPIKED_PIT)) {
            // 3775-3787. A metallivore that did not pull free eats the bear
            // trap outright through deltrap(), or turns a spiked pit back into
            // a pit. M1_METALLIVORE appears on three species in monsters.h --
            // the rock mole at 919-924, the rust monster at 2147-2152 and the
            // xorn at 2357-2364 -- and no starting pet is one of them. The
            // refusal sits at C's own position rather than at the top of the
            // arm, so a metallivore that rolls the escape still takes it.
            unsupported('a monster eating a trap');
        }
        // 3789. Trap_Moved_Mon is unreachable: only the pit arm's fill_pit()
        // can move a monster out of this arm, and that is refused above.
        return monster.mtrapped ? Trap_Caught_Mon : Trap_Effect_Finished;
    }

    let flags = mintrapflags;
    let forcetrap = (flags & FORCETRAP) !== 0;
    const forcebungle = (flags & FORCEBUNGLE) !== 0;
    /* monster has seen such a trap before */
    const alreadySeen = mon_knows_traps(monster, tt)
        || (tt === HOLE && !mindless(species));

    if (fixed_tele_trap(trap)) {
        flags |= FORCETRAP;
        forcetrap = true;
    }

    if (monster === state.u?.usteed) {
        /* true when called from dotrap, inescapable is not an option */
    } else if (state.level?.flags?.sokoban_rules
        && (is_pit(tt) || is_hole(tt)) && !trap.madeby_u) {
        /* nothing here, the trap effects will handle messaging */
    } else if (!forcetrap) {
        if (floor_trigger(tt) && check_in_air(monster, flags, state))
            return Trap_Effect_Finished;
        if (alreadySeen && random.rn2(4) && !forcebungle)
            return Trap_Effect_Finished;
    }

    mon_learns_traps(monster, tt);
    mons_see_trap(trap, {
        state,
        mCansee: (subject, x, y) => clear_path(subject.mx, subject.my, x, y),
    });

    /* Monster is aggravated by being trapped by you. */
    if (trap.madeby_u && random.rnl(5))
        await setmangry(monster, false, env);

    const result = await trapeffect_selector(monster, trap, flags, env);

    // C ref: trap.c:3827-3835. A monster the effect left trapped in a non-pit
    // stops hiding under an object. Only trapeffect_selector() arms that set
    // mtrapped reach it, and the squeaky board is not one of them.
    //
    // The whole block is a no-op for a victim that was not hiding, so only a
    // hiding one stops here. mon.c maybe_unhide_at() (4698-4720) reads
    // mtmp->mundetected into `undetected` and calls hideunder() only inside
    // `if (undetected && ...)`, so with that bit clear it changes nothing and
    // canseemon() answers the same after it as before. display.h:129 makes
    // canspotmon() `canseemon() || sensemon()`, so `!alreadyspotted` implies
    // `!canseemon` and the "%s appears." line cannot fire either. The refusal
    // is wider than maybe_unhide_at()'s own guard, which also wants a
    // hides_under() species or an eel out of water; hideunder() and Amonnam()
    // are what it owns.
    if (monster.mhp >= 1 && monster.mtrapped && monster.mundetected)
        unsupported('a monster trapped under an object');
    return result;
}
