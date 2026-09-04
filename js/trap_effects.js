// Trap triggering, for the hero and for monsters.
// C ref: trap.c -- wearing_iron_shoes(), floor_trigger(), check_in_air(),
// seetrap(), feeltrap(), trapnote(), t_missile(), thitm(),
// trapeffect_sqky_board(), trapeffect_dart_trap(), trapeffect_rocktrap(),
// trapeffect_bear_trap(),
// mselftouch(), trapeffect_pit(), trapeffect_telep_trap(),
// trapeffect_magic_trap(), trapeffect_rolling_boulder_trap(),
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
    A_CON,
    A_DEX,
    BEAR_TRAP,
    BOLT_LIM,
    DART_TRAP,
    DEAF,
    DISP_END,
    DISP_FLASH,
    DOOR,
    FAILEDUNTRAP,
    FIRE_TRAP,
    FOOT,
    FORCEBUNGLE,
    FORCETRAP,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    HOLE,
    HURTLING,
    IS_OBSTRUCTED,
    IS_STWALL,
    IS_TREE,
    IRONBARS,
    In_quest,
    KILLED_BY_AN,
    LANDMINE,
    LAUNCH_KNOWN,
    LAUNCH_UNSEEN,
    LEFT_SIDE,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    PIT,
    POLY_TRAP,
    RIGHT_SIDE,
    ROCKTRAP,
    ROLL,
    ROLLING_BOULDER_TRAP,
    RUST_TRAP,
    SLP_GAS_TRAP,
    SPIKED_PIT,
    SPINE,
    SQKY_BOARD,
    STATUE_TRAP,
    TELEP_TRAP,
    TOOKPLUNGE,
    TRAPDOOR,
    TT_BEARTRAP,
    Trap_Caught_Mon,
    Trap_Effect_Finished,
    Trap_Is_Gone,
    Trap_Killed_Mon,
    Upolyd,
    VIASITTING,
    VIBRATING_SQUARE,
    WEB,
    W_ARMF,
    is_hole,
    is_pit,
    isok,
    u_at,
} from './const.js';
import { stop_occupation } from './allmain.js';
import { exercise, poisoned } from './attrib.js';
import { map_trap, newsym, obj_to_glyph, tmp_at } from './display.js';
import { set_wounded_legs } from './do.js';
import { at_dgn_entrance, on_level } from './dungeon.js';
import { capitalizedMonsterName, monsterCommonName } from './do_name.js';
import { game } from './gstate.js';
import { dist2, distmin, sgn } from './hacklib.js';
import {
    UnsupportedHeroMoveBoundaryError,
    curs_on_u,
    losehp,
    nh_delay_output,
    nomul,
} from './hack.js';
import { done } from './end.js';
import { obj_extract_self, obfree, stackobj } from './invent.js';
import { maybe_unhide_at, monkilled, wake_nearto } from './mon.js';
import {
    amorphous,
    grounded,
    is_floater,
    is_flyer,
    is_neuter,
    is_whirly,
    metallivorous,
    mindless,
    mon_knows_traps,
    mon_learns_traps,
    mons_see_trap,
    passes_rocks,
    passes_walls,
    touch_petrifies,
    unsolid,
} from './mondata.js';
import {
    AD_PHYS,
    AD_RBRE,
    MZ_SMALL,
    PM_BUGBEAR,
    PM_OWLBEAR,
    PM_PIT_FIEND,
    PM_PIT_VIPER,
} from './monsters.js';
import { m_at } from './monst.js';
import { thitu } from './mthrowu.js';
import {
    dealloc_obj,
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
import { BOULDER, CORPSE, DART, IRON, ROCK } from './objects.js';
import { donameFresh, just_an } from './objnam.js';
import { encumber_msg } from './pickup.js';
import { body_part } from './polyself.js';
import { d, rn1, rn2, rn2_on_display_rng, rnd, rne } from './rng.js';
import { canSeeMonster, heroIsBlind, messageAt } from './startup_a11y.js';
import {
    Flying,
    Levitation,
    deltrap,
    set_utrap,
    t_at,
    trapname,
} from './trap.js';
import { tele_trap } from './teleport.js';
import { ttyPline } from './tty_message.js';
import { dmgval } from './weapon.js';
import {
    block_point,
    cansee,
    clear_path,
    couldsee,
    recalc_block_point,
} from './vision.js';
import { find_mac, which_armor } from './worn.js';

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
        random: { d, rn1, rn2, rnd, rne },
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
        // C 1276: u.usteed arm. preflight_dotrap() refuses when u.usteed is
        // set, so this is unreachable here. The rn2(2) that C spends for
        // steedintrap() does not fire because its guard (u.usteed) is false.
        const hit = await thitu(
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
                ),
            },
        );
        if (hit) {
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

// C ref: trap.c mselftouch() (3912-3933). A monster that has just been thrown
// about touches its own wielded corpse; trapeffect_pit()'s monster arm below
// is the caller this port was written for.
//
// Only the guard is ported. The body needs minstapetrify(), corpse_xname()
// and mwepgone(), none of which is ported, so it stops the scan. The stop is
// one conjunct wider than C's condition: monst.h:279 resists_ston() expands to
// mondata.c Resists_Elem() (129-231), which is not ported either, so the port
// also stops for a stone-resistant monster, which C would let walk away.
function mselftouch(mon, _arg, _byplayer, env) {
    const { state } = env;
    const unsupported = requireTrapOperation(env, 'unsupported');
    const mwep = mon.mw; /* MON_WEP() */

    if (mwep && mwep.otyp === CORPSE
        && touch_petrifies(state.mons?.[mwep.corpsenm]))
        unsupported('a monster touching its wielded corpse');
}

// C ref: trap.c trapeffect_pit() (1824-2010), monster arm (1966-2008).
//
// The hero arm (1835-1965) stops the scan. preflight_dotrap() below already
// refuses every trap type but BEAR_TRAP ahead of the hero's move, so nothing
// reaches the stop here; it stands because trapeffect_selector() no longer
// refuses PIT on the way in, and a hero arm that fell through would set
// u.utrap and spend rn1(6, 2) with none of its messages written.
//
// trapeffect_selector() dispatches PIT here and still refuses SPIKED_PIT, so
// C's `relevant_spikes` (1833) is always FALSE and is absent, together with
// the two places that read it: the wearing_iron_shoes() test at 2001 that
// clears it and the rnd(10) it would choose at 2003. Whoever ports SPIKED_PIT
// restores all three.
async function trapeffect_pit(mtmp, trap, trflags, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const unsupported = requireTrapOperation(env, 'unsupported');

    if (mtmp === state.youmonst) unsupported('a hero falling into a pit');

    const in_sight = canSeeMonster(mtmp, state) || mtmp === state.u?.usteed;
    const forcetrap = (trflags & FORCETRAP) !== 0;
    const sokoban = Boolean(state.level?.flags?.sokoban_rules);
    const inescapable = forcetrap || (sokoban && !trap.madeby_u);
    const mptr = mtmp.data;
    let fallverb = 'falls';

    const airborne = !grounded(mptr, state);
    // C ref: trap.c:1975. C reads the worm term only when the monster is on
    // the ground, and worm.c count_wsegs() is not ported, so the stop sits
    // exactly where C would call it rather than at the top of the arm.
    if (!airborne && mtmp.wormno)
        unsupported('a long worm falling into a pit');
    if (airborne) {
        if (forcetrap && !sokoban) {
            /* openfallingtrap; not inescapable here */
            if (in_sight) {
                seetrap(trap, env);
                await message(
                    messageAt(
                        `${capitalizedMonsterName(mtmp, state)} doesn't fall`
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
                `${capitalizedMonsterName(mtmp, state)} ${fallverb} into`
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
    // C ref: trap.c:2002-2004. The damage roll is thitm()'s argument, so a
    // monster mselftouch() already killed spends no rnd(6).
    const trapkilled = mtmp.mhp < 1 /* DEADMONSTER() */
        || await thitm(0, mtmp, null, random.rnd(6), false, env);

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
//   fate 11: toggle HInvis -- refused (needs self_invis_message, HInvis
//     toggle, pm_invisible, See_invisible, EInvis).
//   fate 12: dofiretrap() -- refused (not ported).
//   fate 13-18: odd-feelings messages, fully ported.
//   fate 19: tame nearby monsters -- refused (needs adjattrib, tamedog).
//   fate 20: uncurse items -- refused (needs seffects with SPE_REMOVE_CURSE).
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
            // Needs self_invis_message(), HInvis toggle, pm_invisible(),
            // See_invisible, EInvis.
            unsupported('magic trap invisibility toggle');
            break; // unreachable; unsupported throws
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

// C ref: trap.c trapeffect_telep_trap() (2069-2085), hero arm only.
//
// The monster arm forwards to teleport.c mtele_trap(), which needs the
// seeTrap, newsym and setApparxy owners that mintrap()'s callers do not bind
// and set_apparxy(), which is not ported. It refuses here rather than from
// UNPORTED_TRAP_EFFECTS, the way trapeffect_magic_trap() and trapeffect_pit()
// each own the refusal for the arm they do not cover.
async function trapeffect_telep_trap(mtmp, trap, _trflags, env) {
    const state = env.state;
    const unsupported = requireTrapOperation(env, 'unsupported');

    if (mtmp === state.youmonst) {
        seetrap(trap, env);
        await tele_trap(trap, state);
        return Trap_Effect_Finished;
    }
    unsupported('a monster on a teleport trap');
    return Trap_Effect_Finished; // unreachable
}

// C ref: trap.c trapeffect_magic_trap() (2293-2320), hero arm only.
//
// The hero arm calls seetrap(), rolls rn2(30) for a 1/30 magical-explosion
// branch, and otherwise dispatches to domagictrap(). The 1/30 explosion
// branch calls deltrap() and is refused.
//
// steedintrap() at line 2313 is effectively dead: preflight_dotrap() refuses
// mounted heroes before the trap fires, so u.usteed is always null here.
//
// The monster arm (lines 2314-2318) rolls rn2(21) and dispatches to
// trapeffect_fire_trap(); it runs only when trapeffect_selector() dispatches
// a monster, but MAGIC_TRAP is still in UNPORTED_TRAP_EFFECTS for the
// monster arm because trapeffect_fire_trap() is not ported. The hero arm
// uses this dedicated function instead of the selector's refusal.
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
        // C line 2313: (void) steedintrap(trap, (struct obj *) 0);
        // preflight_dotrap() refuses mounted heroes, so u.usteed is null and
        // steedintrap() would return 0 without side effects.
        return Trap_Effect_Finished;
    }
    // Monster arm: rn2(21) then trapeffect_fire_trap(). The monster dispatch
    // through UNPORTED_TRAP_EFFECTS refuses before reaching here.
    unsupported('a monster on a magic trap');
    return Trap_Effect_Finished; // unreachable
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
        place_object(lp.obj, lp.x, lp.y, { state });
    }
}

// C ref: trap.c launch_obj() (3260-3575). Moves an object of type otyp from
// (x1,y1) toward (x2,y2). Returns 0 if no object was launched, 1 if launched
// and placed, 2 if launched and used up.
//
// This port covers the hero arm of the main loop: the ROLL|LAUNCH_KNOWN style,
// hero collision via thitu (miss or hit), and boulder stopping at a wall or at
// the destination. Unreached branches (monster collision via ohitmon,
// throws_rocks snatch, ship_object/down_gate, boulder-on-trap interactions,
// boulder-chain collisions, door crashes, iron bars hits_bars) throw.
async function launch_obj(otyp, x1, y1, x2, y2, style, state) {
    const message = (line) => ttyPline(line, state);

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
        hooks: {
            blockPoint: block_point,
            extractExternalObject: remove_object,
            recalcBlockPoint: recalc_block_point,
        },
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
    newsym(x1, y1);
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
        // Monster arm: the hero hears but doesn't see the boulder start.
        throw new Error('launch_obj ROLL|LAUNCH_UNSEEN not yet ported');
    case ROLL | LAUNCH_KNOWN:
        // use otrapped as a flag to ohitmon
        singleobj.otrapped = 1;
        style &= ~LAUNCH_KNOWN;
        // FALLTHROUGH
    // eslint-disable-next-line no-fallthrough
    case ROLL:
        delaycnt = 2;
        // FALLTHROUGH
    // eslint-disable-next-line no-fallthrough
    default:
        if (!delaycnt)
            delaycnt = 1;
        if (!cansee(x, y, state))
            await curs_on_u(state);
        await tmp_at(DISP_FLASH, obj_to_glyph(singleobj, state,
            rn2_on_display_rng), state);
        await tmp_at(x, y, state);
    }
    // Mark a spot for bones files to prevent loss of object mid-flight.
    launch_drop_spot(singleobj, x, y, state);

    // Set the object in motion
    while (dist-- > 0 && !used_up) {
        await tmp_at(x, y, state);
        let tmp = delaycnt;

        // Delay only if hero sees it
        if (cansee(x, y, state))
            while (tmp-- > 0)
                await nh_delay_output(state);

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
                // throws_rocks snatch: not yet ported
                // ohitmon: not yet ported
            }
            // C: ohitmon() handles monster collision. Not reached in the
            // session's path (no monster in the boulder's trajectory).
            throw new Error('launch_obj monster collision not yet ported');
        } else if (u_at(x, y, state)) {
            const dam = dmgval(singleobj, state.youmonst, state);

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
                    message: (line, s) => ttyPline(line, s),
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
                    // These interactions are not yet ported; they are not
                    // reached in the session.
                    throw new Error(
                        'launch_obj boulder-on-trap interaction not yet ported');
                default:
                    break;
                }
            }
            // C calls flooreffects() here, which for a boulder checks
            // boulder_hits_pool() (water/lava) and pit/hole traps. The JS port
            // of flooreffects() throws unconditionally for boulders because
            // boulder_hits_pool() is not ported. On ordinary floor, C returns
            // FALSE (no-op), so skipping the call is correct there. If the
            // boulder IS on water, lava, or a pit, the t_at() check above
            // already throws for the trap case, and the remaining pool/lava
            // cases are unreached in the session.
            if (otyp === BOULDER && sobj_at(BOULDER, x, y, state)) {
                // Boulder-chain collision: not reached in the session.
                throw new Error(
                    'launch_obj boulder-chain collision not yet ported');
            }
        }
        // closed_door: boulder crashes through a door. Not reached.
        if (otyp === BOULDER) {
            const loc = state.level?.at(x, y);
            if (loc && loc.typ === DOOR) {
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
    await tmp_at(DISP_END, 0, state);
    launch_drop_spot(null, 0, 0, state);
    if (!used_up) {
        singleobj.otrapped = 0;
        place_object(singleobj, x2, y2, objectEnv);
        newsym(x2, y2);
        return 1;
    }
    return 2;
}

// C ref: trap.c trapeffect_rolling_boulder_trap() (2661-2707). Hero arm only;
// the monster arm is not reached by any development session and throws.
async function trapeffect_rolling_boulder_trap(monster, trap, _trflags, env) {
    const { state } = env;
    const message = requireTrapOperation(env, 'message');
    const unsupported = requireTrapOperation(env, 'unsupported');

    if (monster === state.youmonst) {
        let style = ROLL | (trap.tseen ? LAUNCH_KNOWN : 0);

        feeltrap(trap, env);
        await message(`${!heroIsDeaf(state) ? 'Click!  ' : ''
            }You trigger a rolling boulder trap!`, state);
        if (!await launch_obj(BOULDER, trap.launch.x, trap.launch.y,
                trap.launch2.x, trap.launch2.y, style, state)) {
            // If this is a known trap, use a shorter message.
            if (style & LAUNCH_KNOWN)
                await message('No boulder was released.', state);
            else
                await message(
                    'Fortunately for you, no boulder was released.', state);
        }
    } else {
        // Monster arm: not reached in any development session.
        unsupported('a monster triggering a rolling boulder trap');
    }
    return Trap_Effect_Finished;
}

// Local helper: checks the Deaf property on the hero. youprop.h defines Deaf
// as the intrinsic or the extrinsic of property index 16 (DEAF), plus
// uroleplay.deaf.
function heroIsDeaf(state) {
    const deafProp = state.u?.uprops?.[DEAF];
    return Boolean((deafProp?.intrinsic || deafProp?.extrinsic)
        || state.u?.uroleplay?.deaf);
}

// The trap types whose trapeffect_*() body has no arm in the port yet. C
// dispatches all of them; each stops the scan before the effect changes state,
// draws, or writes a message. BEAR_TRAP, DART_TRAP and MAGIC_TRAP are absent
// because their hero arms are ported (MAGIC_TRAP's monster arm refuses inside
// trapeffect_magic_trap() itself). ROCKTRAP is absent for the mirror reason:
// its monster arm is ported and its own body refuses the hero arm. PIT is absent because its own body owns the
// refusal: its monster arm is ported and its hero arm stops there. SPIKED_PIT
// stays here even though C sends it to trapeffect_pit() as well, because
// neither arm's spike handling is ported.
const UNPORTED_TRAP_EFFECTS = Object.freeze(new Set([
    ARROW_TRAP,
    SLP_GAS_TRAP,
    RUST_TRAP,
    FIRE_TRAP,
    SPIKED_PIT,
    HOLE,
    TRAPDOOR,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    WEB,
    STATUE_TRAP,
    ANTI_MAGIC,
    LANDMINE,
    POLY_TRAP,
    VIBRATING_SQUARE,
]));

// C ref: trap.c trapeffect_selector() (2936-2992). C's default arm calls
// impossible() for a type outside the switch; the port throws instead, since
// impossible() is not ported and a type outside 1..TRAPNUM-1 means the trap
// list is corrupt.
export async function trapeffect_selector(monster, trap, trflags, env) {
    const unsupported = requireTrapOperation(env, 'unsupported');
    if (trap.ttyp === SQKY_BOARD)
        return trapeffect_sqky_board(monster, trap, trflags, env);
    if (trap.ttyp === DART_TRAP)
        return trapeffect_dart_trap(monster, trap, trflags, env);
    if (trap.ttyp === ROCKTRAP)
        return trapeffect_rocktrap(monster, trap, trflags, env);
    if (trap.ttyp === BEAR_TRAP)
        return trapeffect_bear_trap(monster, trap, trflags, env);
    if (trap.ttyp === PIT)
        return trapeffect_pit(monster, trap, trflags, env);
    if (trap.ttyp === MAGIC_TRAP)
        return trapeffect_magic_trap(monster, trap, trflags, env);
    if (trap.ttyp === TELEP_TRAP)
        return trapeffect_telep_trap(monster, trap, trflags, env);
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
//   every type but BEAR_TRAP, DART_TRAP, MAGIC_TRAP, TELEP_TRAP, and
//     ROLLING_BOULDER_TRAP -- its own trapeffect_*() arm;
//   a magic-resistant hero on a teleport trap -- shieldeff(), a tmp_at()
//     animation, at teleport.c:1503;
//   a fixed-destination teleport trap with a monster standing on the
//     destination -- teleport.c:1516's rloc_to(), whose port covers only a
//     monster that is not yet on the map;
//   a trap the hero has already seen -- trapname(), for the "You step over
//     ..." line at trap.c:3028 and the "You escape ..." line at :3039, and
//     with it the one-in-five rn2(5) escape roll at :3038 that decides
//     between them, plus Fumbling, conjoined_pits() and
//     adj_nonconjoined_pit(), which are read nowhere else in dotrap();
//   a mounted hero -- steedintrap() at trap.c:1276 (dart trap),
//     s_suffix(mon_nam()) and mbodypart() at trap.c:1508-1509 (bear trap),
//     and steedintrap() at trap.c:2313 (magic trap);
//   iron shoes -- Yname2(uarmf), at trap.c:1518 (bear trap only).
export function preflight_dotrap(trap, state = game) {
    if (trap.ttyp !== BEAR_TRAP && trap.ttyp !== DART_TRAP
        && trap.ttyp !== MAGIC_TRAP && trap.ttyp !== TELEP_TRAP
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
    if (trap.tseen) {
        throw new UnsupportedHeroMoveBoundaryError(
            'a trap the hero has already seen',
        );
    }
    if (state.u.usteed) {
        // trap.c:1276 (dart trap) calls steedintrap(); trap.c:1507-1511 (bear
        // trap) names the steed through s_suffix(mon_nam()) and mbodypart();
        // trap.c:2313 (magic trap) calls steedintrap().
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
// hack.c spoteffects() calls it for the trap under the hero's feet.
//
// C computes forcebungle, plunged, conj_pit and adj_pit at 3002-3005 and reads
// all four only inside the escape branch at 3035-3044, which preflight_dotrap()
// refuses. They are therefore absent here rather than computed and discarded;
// conjoined_pits() and adj_nonconjoined_pit() would in any case answer FALSE,
// because each requires is_pit() of `trap` itself and BEAR_TRAP is the only
// type admitted.
export async function dotrap(trap, trflags, state = game) {
    // First, and before nomul(0): a refusal has to precede the state change,
    // not follow it.
    preflight_dotrap(trap, state);

    const u = state.u;
    const ttype = trap.ttyp;
    const already_seen = trap.tseen;
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
        // trap.c:3021-3023, the "Air currents pull you down" line, needs
        // trapname(). It fires only for a pit or a hole, and preflight_dotrap()
        // has already refused every type but BEAR_TRAP, so this cannot run.
        env.unsupported('a Sokoban pit or hole');
        /* then proceed to normal trap effect */
    } else if (!forcetrap) {
        if (floor_trigger(ttype)
            && check_in_air(state.youmonst, flags, state)) {
            // trap.c:3027-3032. A hero who floats or flies over an unseen trap
            // triggers nothing and is told nothing; the "You step over ..."
            // line for a seen one needs trapname() and is refused above.
            if (already_seen) env.unsupported('stepping over a seen trap');
            return;
        }
        if (already_seen) env.unsupported('escaping a seen trap');
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
    // mksobj() and next_ident(), which need rn1, rnd and rne. Proving them
    // here rather than in the arm matters, because the arm runs after
    // mon_learns_traps() has written mtrapseen on the victim and every
    // onlooker, and after the rn2(4) and rnl(5) gates may have drawn -- so a
    // late proof would refuse with state already changed, and with a bare
    // TypeError that ELAPSED_TURN_PLANNING_REFUSALS does not convert.
    const random = env.random;
    for (const name of ['rn1', 'rn2', 'rnd', 'rne', 'rnl'])
        if (typeof random?.[name] !== 'function')
            throw new TypeError('mintrap requires rn1, rn2, rnd, rne and rnl');
    for (const name of ['redraw', 'mInAir', 'heroDeaf', 'youHear'])
        requireTrapOperation(env, name);
    const message = requireTrapOperation(env, 'message');

    const tt = trap.ttyp;

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
                        + ` of the ${trapname(tt)}.`,
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
        } else if (metallivorous(species)) {
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
    if (trap.madeby_u && random.rnl(5)) {
        // mon.c setmangry(). maketrap() clears madeby_u for every generated
        // trap, and no ported command sets one, so nothing reaches this.
        unsupported('a monster angered by a hero-set trap');
    }

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
