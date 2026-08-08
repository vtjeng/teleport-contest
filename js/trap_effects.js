// Trap triggering, for the hero and for monsters.
// C ref: trap.c -- wearing_iron_shoes(), floor_trigger(), check_in_air(),
// seetrap(), feeltrap(), trapnote(), t_missile(), thitm(),
// trapeffect_sqky_board(), trapeffect_dart_trap(), trapeffect_bear_trap(),
// trapeffect_selector(), dotrap(), mintrap().
//
// These are trap.c functions and belong beside js/trap.js's maketrap() group
// by file name. They are split out because they reach the display, naming,
// vision and monster subsystems, and js/display.js and js/startup_a11y.js
// both import js/trap.js: adding those edges to js/trap.js would put it inside
// the display import cycle. js/trap_erode_obj.js and js/trap_water_damage.js
// split the same file for the same reason.

import {
    ANTI_MAGIC,
    ARROW_TRAP,
    A_DEX,
    BEAR_TRAP,
    BOLT_LIM,
    DART_TRAP,
    FAILEDUNTRAP,
    FIRE_TRAP,
    FOOT,
    FORCEBUNGLE,
    FORCETRAP,
    HALF_PHDAM,
    HOLE,
    HURTLING,
    KILLED_BY_AN,
    LANDMINE,
    LEFT_SIDE,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    PIT,
    POLY_TRAP,
    RIGHT_SIDE,
    ROCKTRAP,
    ROLLING_BOULDER_TRAP,
    RUST_TRAP,
    SLP_GAS_TRAP,
    SPIKED_PIT,
    SQKY_BOARD,
    STATUE_TRAP,
    TELEP_TRAP,
    TOOKPLUNGE,
    TRAPDOOR,
    TT_BEARTRAP,
    Trap_Caught_Mon,
    Trap_Effect_Finished,
    Trap_Killed_Mon,
    VIASITTING,
    VIBRATING_SQUARE,
    WEB,
    W_ARMF,
    is_hole,
    is_pit,
    isok,
} from './const.js';
import { exercise } from './attrib.js';
import { map_trap, newsym } from './display.js';
import { set_wounded_legs } from './do.js';
import { capitalizedMonsterName, monsterCommonName } from './do_name.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import {
    UnsupportedHeroMoveBoundaryError,
    losehp,
    nomul,
} from './hack.js';
import { stackobj } from './invent.js';
import { wake_nearto } from './mon.js';
import {
    amorphous,
    is_floater,
    is_flyer,
    is_whirly,
    mindless,
    mon_knows_traps,
    mon_learns_traps,
    mons_see_trap,
    unsolid,
} from './mondata.js';
import { MZ_SMALL, PM_BUGBEAR, PM_OWLBEAR } from './monsters.js';
import { mksobj, objectType, place_object, weight } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { DART, IRON } from './objects.js';
import { donameFresh, just_an } from './objnam.js';
import { body_part } from './polyself.js';
import { d, rn1, rn2 } from './rng.js';
import { canSeeMonster, messageAt } from './startup_a11y.js';
import { Flying, Levitation, set_utrap, t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { cansee, clear_path, couldsee } from './vision.js';
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

// trap.c:78 A_Your[2], indexed by trap->madeby_u. Only the bear trap's four
// messages read it so far; trap.c:77's lowercase a_your[2] has no ported
// reader yet, because every message that takes it is refused.
const A_Your = Object.freeze(['A', 'Your']);

// The hero's dotrap() runs in the live game, never in the planning clone that
// mintrap() serves, so its env binds the real owners rather than dry-run
// seams. `unsupported` raises the movement boundary because every hero call
// site -- hack.c spoteffects() and, through it, domove() and teleds() -- sits
// under js/jsmain.js's movement catch.
function heroTrapEnv(state) {
    return {
        state,
        random: { d, rn1, rn2 },
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

// C ref: trap.c thitm() (6709-6773), the `!strike` arm. The `strike` arm needs
// weapon.c dmgval() for the damage roll and mon.c monkilled() for a lethal
// one, and neither is ported, so it stops the scan after the to-hit roll and
// before the message, the damage and the missile's disposal. The `d_override`
// and `nocorpse` parameters are C's; only trapeffect_dart_trap() calls this
// here, and it passes 0 and FALSE, so `nocorpse` -- read only by the refused
// arm's monkilled() call -- goes unused.
async function thitm(tlev, mon, obj, d_override, _nocorpse, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const unsupported = requireTrapOperation(env, 'unsupported');

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
    if (strike) unsupported('a monster hit by a trap');

    if (obj && cansee(mon.mx, mon.my, state)) {
        // doname() runs for its discovery side effects as well as its text:
        // xname() calls observe_object(), which sets dknown and enters the
        // type in the hero's discoveries. C names the missile while it is
        // still free, before place_object() puts it on the floor.
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
    // C ref: trap.c:6766-6770. A missed missile lands where the target
    // stands; only a missile that struck is deallocated, which the refusal
    // above owns. No newsym() follows in C.
    if (obj) {
        place_object(obj, mon.mx, mon.my, env.objectEnv);
        stackobj(obj, env.objectEnv);
    }
    return false; /* trapkilled */
}

// C ref: trap.c trapeffect_dart_trap() (1250-1321), monster arm (1294-1318).
// The `mtmp == &gy.youmonst` arm reaches the hero only through dotrap(), which
// is not ported. C computes `see_it` at the top of the monster arm
// (trap.c:1296) but reads it in one place only, the misfire arm's message
// (trap.c:1300), and that arm stops the scan before writing anything. The port
// therefore has no `see_it` at all. Whoever ports the misfire arm must add
// `cansee(mtmp.mx, mtmp.my, state)` back at C's position relative to the
// rn2(15) draw.
async function trapeffect_dart_trap(mtmp, trap, _trflags, env) {
    const { state } = env;
    const random = env.random;
    const unsupported = requireTrapOperation(env, 'unsupported');
    // Resolved for their throw, not their value. Every owner this arm can
    // reach has to be proven present here, before the misfire draw and before
    // trap->once is written; a later resolution would refuse after the arm had
    // already spent randomness or written state. The previous pass over this
    // file confirmed three defects of exactly that shape.
    requireTrapOperation(env, 'message');
    requireTrapOperation(env, 'redraw');
    const objectEnv = objectGenerationEnv({ state, random });

    const inSight = canSeeMonster(mtmp, state) || mtmp === state.u?.usteed;

    if (trap.once && trap.tseen && !random.rn2(15)) {
        // The trap wears out: C writes the "nothing happens" line, calls
        // deltrap() and repaints. deltrap() is not ported, and dropping the
        // trap from the level list is the one write in this arm no later
        // owner can reconstruct.
        unsupported('a dart trap that wears out');
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

// C ref: trap.c trapeffect_bear_trap() (1478-1560), hero arm (1489-1524). The
// monster arm (1525-1559) stops the scan: it reaches thitm()'s strike arm,
// which needs mon.c monkilled().
//
// Two of the hero arm's branches stop as well, and both are refused ahead of
// the move by preflight_dotrap() rather than here, so that no refusal lands
// after feeltrap() has repainted or set_utrap() has written u.utrap: the
// mounted arm at 1507-1511 needs s_suffix(mon_nam()), mbodypart() and the same
// thitm() strike arm, and the iron-shoes line at 1517-1518 needs Yname2().
// `dmg` is rolled before either of them, at C's position, because the roll
// happens whether or not the branch that spends it is taken.
async function trapeffect_bear_trap(mtmp, trap, trflags, env) {
    const { state } = env;
    const random = env.random;
    const message = requireTrapOperation(env, 'message');
    const unsupported = requireTrapOperation(env, 'unsupported');
    const is_you = mtmp === state.youmonst;
    const forcetrap = (trflags & FORCETRAP) !== 0
        || (trflags & FAILEDUNTRAP) !== 0
        || (is_you && (trflags & VIASITTING) !== 0);

    if (!is_you) unsupported('a monster caught in a bear trap');

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

// The trap types whose trapeffect_*() body has no arm in the port yet. C
// dispatches all of them; each stops the scan before the effect changes state,
// draws, or writes a message. BEAR_TRAP is absent because its own body now
// owns the refusal: its hero arm is ported and its monster arm stops there.
const UNPORTED_TRAP_EFFECTS = Object.freeze(new Set([
    ARROW_TRAP,
    ROCKTRAP,
    SLP_GAS_TRAP,
    RUST_TRAP,
    FIRE_TRAP,
    PIT,
    SPIKED_PIT,
    HOLE,
    TRAPDOOR,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    TELEP_TRAP,
    WEB,
    STATUE_TRAP,
    MAGIC_TRAP,
    ANTI_MAGIC,
    LANDMINE,
    POLY_TRAP,
    ROLLING_BOULDER_TRAP,
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
    if (trap.ttyp === BEAR_TRAP)
        return trapeffect_bear_trap(monster, trap, trflags, env);
    if (UNPORTED_TRAP_EFFECTS.has(trap.ttyp)) unsupported('trap activation');
    throw new Error(`trapeffect_selector: strange trap type ${trap.ttyp}`);
}

// Everything dotrap() and trapeffect_bear_trap()'s hero arm cannot answer,
// asked before the hero commits to the square so that no refusal lands after a
// draw or a state change. hack.c requireSimpleHeroDestination() calls this
// ahead of the move, and dotrap() calls it again as its first statement for
// any caller that arrives another way.
//
// The four stops, and what each of them needs:
//   every type but BEAR_TRAP -- its own trapeffect_*() arm;
//   a trap the hero has already seen -- trapname(), for the "You step over
//     ..." line at trap.c:3028 and the "You escape ..." line at :3039, and
//     with it the one-in-five rn2(5) escape roll at :3038 that decides
//     between them, plus Fumbling, conjoined_pits() and
//     adj_nonconjoined_pit(), which are read nowhere else in dotrap();
//   a mounted hero -- s_suffix(mon_nam()), mbodypart() and thitm()'s strike
//     arm, at trap.c:1508-1511;
//   iron shoes -- Yname2(uarmf), at trap.c:1518.
export function preflight_dotrap(trap, state = game) {
    if (trap.ttyp !== BEAR_TRAP)
        throw new UnsupportedHeroMoveBoundaryError('trap activation');
    if (trap.tseen) {
        throw new UnsupportedHeroMoveBoundaryError(
            'a trap the hero has already seen',
        );
    }
    if (state.u.usteed) {
        throw new UnsupportedHeroMoveBoundaryError(
            'a bear trap closing on a steed',
        );
    }
    if (wearing_iron_shoes(state.youmonst, state)) {
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

// C ref: trap.c mintrap() (3732-3840). Covers the wrapper's `!trap` arm, every
// gate of its `!mtmp->mtrapped` arm, and the dispatch into
// trapeffect_selector(). The `mtmp->mtrapped` arm needs fill_pit(), deltrap()
// and m_easy_escape_pit() and stops the scan instead;
// assertSimpleActionState() in js/unported_monster_actions.js already refuses a
// monster carrying mtrapped before dochug() runs, so no scan reaches it.
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
    if (monster.mtrapped) unsupported('a monster escaping a trap');
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
    for (const name of ['redraw', 'mInAir', 'heroDeaf', 'youHear', 'message'])
        requireTrapOperation(env, name);

    const tt = trap.ttyp;
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
    if (monster.mhp >= 1 && monster.mtrapped)
        unsupported('a monster trapped under an object');
    return result;
}
