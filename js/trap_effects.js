// Trap triggering for monsters.
// C ref: trap.c -- floor_trigger(), check_in_air(), seetrap(), trapnote(),
// t_missile(), thitm(), trapeffect_sqky_board(), trapeffect_dart_trap(),
// trapeffect_selector(), mintrap().
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
    BEAR_TRAP,
    BOLT_LIM,
    DART_TRAP,
    FIRE_TRAP,
    FORCEBUNGLE,
    FORCETRAP,
    HOLE,
    HURTLING,
    LANDMINE,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    PIT,
    POLY_TRAP,
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
    Trap_Caught_Mon,
    Trap_Effect_Finished,
    Trap_Killed_Mon,
    VIASITTING,
    VIBRATING_SQUARE,
    WEB,
    is_hole,
    is_pit,
    isok,
} from './const.js';
import { capitalizedMonsterName, monsterCommonName } from './do_name.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { stackobj } from './invent.js';
import { wake_nearto } from './mon.js';
import {
    is_floater,
    is_flyer,
    mindless,
    mon_knows_traps,
    mon_learns_traps,
    mons_see_trap,
} from './mondata.js';
import { mksobj, place_object, weight } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { DART } from './objects.js';
import { donameFresh, just_an } from './objnam.js';
import { canSeeMonster, messageAt } from './startup_a11y.js';
import { t_at } from './trap.js';
import { cansee, clear_path, couldsee } from './vision.js';
import { find_mac } from './worn.js';

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
        throw new TypeError(`mintrap requires the ${name} owner`);
    return operation;
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

// C ref: trap.c check_in_air(). C branches on `mtmp == &gy.youmonst` and reads
// Levitation and Flying for the hero. Of its three call sites -- trap.c:1112 in
// m_harmless_trap(), :3026 in dotrap() and :3809 in mintrap() -- only dotrap()
// passes the hero, and dotrap() is not ported. This therefore covers the
// monster arm and throws for the hero rather than answering with a monster's
// properties while claiming to serve both.
export function check_in_air(monster, trflags, state = game) {
    if (monster === state.youmonst)
        throw new TypeError('check_in_air has no hero arm');
    const plunged = (trflags & (TOOKPLUNGE | VIASITTING)) !== 0;
    return (trflags & HURTLING) !== 0
        || is_floater(monster.data)
        || (is_flyer(monster.data) && !plunged);
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

// The trap types whose trapeffect_*() body has no monster arm in the port yet.
// C dispatches all of them; each stops the monster scan before the effect
// changes state, draws, or writes a message.
const UNPORTED_TRAP_EFFECTS = Object.freeze(new Set([
    ARROW_TRAP,
    ROCKTRAP,
    BEAR_TRAP,
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
    if (UNPORTED_TRAP_EFFECTS.has(trap.ttyp)) unsupported('trap activation');
    throw new Error(`trapeffect_selector: strange trap type ${trap.ttyp}`);
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
