// C ref: src/dokick.c. Three of its functions are ported: dokick() (1257-1470),
// the #kick command; kick_nondoor() (974-1253), the terrain chain dokick() ends
// on; and kick_dumb() (863-878), the one arm of that chain this goal reaches.
//
// dokick() is a guard chain, a direction prompt, and five ordered tests over
// the target square -- monsters, pools, objects, non-doors, doors. Only the
// last of those five continues, and only into kick_nondoor()'s final `else`.
// Every other arm throws UnsupportedKickError at its own condition, before that
// arm has drawn a random number, printed a line or changed the hero, so the
// segment keeps every frame the command already matched.
//
// kickdmg(), maybe_kick_monster(), kick_monster(), kick_object(),
// really_kick_object(), kickstr(), watchman_thief_arrest(),
// watchman_door_damage(), kick_ouch(), kick_door(), otransit_msg() and
// drop_to() keep dokick.c company in C and have no ported caller; the arm that
// would reach each one names it in its refusal.

import { exercise, effective_attribute } from './attrib.js';
import { getdir } from './cmd.js';
import {
    A_DEX,
    A_STR,
    BLINDED,
    ECMD_CANCEL,
    ECMD_TIME,
    IRONBARS,
    IS_ALTAR,
    IS_DOOR,
    IS_FOUNTAIN,
    IS_GRAVE,
    IS_SINK,
    IS_STWALL,
    IS_THRONE,
    IS_TREE,
    Is_airlevel,
    Is_waterlevel,
    LA_DOWN,
    LADDER,
    LAVAWALL,
    LEVITATION,
    PASSES_WALLS,
    RIGHT_SIDE,
    SCORR,
    SDOOR,
    SLT_ENCUMBER,
    STAIRS,
    WOUNDED_LEGS,
    isok,
} from './const.js';
import { feel_location, unmap_invisible } from './display.js';
import { set_wounded_legs } from './do.js';
import { u_wipe_engr } from './engrave.js';
import { game } from './gstate.js';
import { near_capacity } from './hack.js';
import { nolimbs, slithy, verysmall } from './mondata.js';
import { wake_nearby } from './mon.js';
import { m_at } from './monst.js';
import { PM_SASQUATCH, S_LIZARD } from './monsters.js';
import { sobj_at } from './obj.js';
import { BOULDER, KICKING_BOOTS } from './objects.js';
import { encumber_msg } from './pickup.js';
import { rn2, rnd } from './rng.js';
import { is_pool } from './trap.js';
import { ttyPline } from './tty_message.js';
import { martial_bonus } from './weapon.js';

// C ref: decl.h:507 `coord kickedloc`, the square the hero just kicked. Three
// C files write it directly: dokick.c:1325 sets it, and hack.c domove():2708
// and cmd.c rhack():3823 clear it. Its one reader is monmove.c
// m_avoid_kicked_loc(), which keeps a peaceful or tame neighbour off that
// square while it stands. The write lives here because dokick() is what gives
// the value meaning; the two clearing sites import this rather than spell the
// pair of zeroes out again, so no file can zero one coordinate and not the
// other.
export function clear_kickedloc(state = game) {
    state.gk ??= {};
    state.gk.kickedloc = { x: 0, y: 0 };
}

// A branch of dokick.c this port has not translated. js/cmd.js
// failClosedCommandRefusals() lists it, so the segment keeps every frame the
// command already matched instead of failing hard.
export class UnsupportedKickError extends Error {
    constructor(what) {
        super(`kicking reached an unported branch: ${what}`);
        this.name = 'UnsupportedKickError';
    }
}

// youprop.h:242 Levitation, which subtracts a blocking term. Spelled out here
// rather than imported for the reason js/trap.js states about its own copy:
// the macro reads three fields of one property, and each C file's port owns
// the macros its own functions read.
function Levitation(state) {
    const levitation = state.u.uprops[LEVITATION];
    return Boolean((levitation.intrinsic || levitation.extrinsic)
                   && !levitation.blocked);
}

// youprop.h:103 Blind, which subtracts a blocking term the two wounded-leg
// and wall-passing macros below do not have.
function Blind(state) {
    const blinded = state.u.uprops[BLINDED];
    return Boolean((blinded.intrinsic || blinded.extrinsic)
                   && !blinded.blocked);
}

// youprop.h:138 Wounded_legs, a plain OR with no blocked term: the intrinsic
// holds the recovery timeout and the extrinsic holds the side bits.
function Wounded_legs(state) {
    const wounded = state.u.uprops[WOUNDED_LEGS];
    return Boolean(wounded.intrinsic || wounded.extrinsic);
}

// youprop.h:286 Passes_walls, likewise a plain OR.
function Passes_walls(state) {
    const passes = state.u.uprops[PASSES_WALLS];
    return Boolean(passes.intrinsic || passes.extrinsic);
}

// C ref: dokick.c:8-10, the martial() macro over is_bigfoot() at :7. A Samurai
// or a Monk answers TRUE from martial_bonus() without either later term being
// read, which is what keeps kick_dumb()'s rn2(3) out of the stream for them.
function martial(state) {
    return martial_bonus(state)
        || state.youmonst?.data?.pmidx === PM_SASQUATCH
        || state.uarmf?.otyp === KICKING_BOOTS;
}

// C ref: dokick.c kick_dumb() (863-878). Kicking at something that does not
// resist: empty floor, an open doorway, a down staircase, a levitating hero's
// throne, altar, fountain, grave or sink.
async function kick_dumb(x, y, state) {
    const u = state.u;
    // 866. A_DEX never reaches exercise()'s trailing encumber_msg(), which C
    // runs for Strength and Constitution only, so this call owns no message.
    await exercise(A_DEX, false, state, { rn2 });
    // 867. martial() and the Dexterity test are both short circuits: a martial
    // hero, and an ordinary one with 16 or more Dexterity, draw no rn2(3) at
    // all. Getting that wrong changes the stream rather than the message.
    if (martial(state) || effective_attribute(state, A_DEX) >= 16 || rn2(3)) {
        await ttyPline('You kick at empty space.', state);
        if (Blind(state)) feel_location(x, y, state);
    } else {
        await ttyPline('Dumb move!  You strain a muscle.', state);
        await exercise(A_STR, false, state, { rn2 },
                       { encumberMessage: encumber_msg });
        // 874. C evaluates rnd(5) before adding, so the draw precedes the
        // write set_wounded_legs() makes.
        await set_wounded_legs(RIGHT_SIDE, 5 + rnd(5), state);
    }
    // 876-877. Both halves of the condition are false for a hero standing on
    // an ordinary level, so the rn2(2) that would decide the recoil is never
    // drawn; this stops ahead of it rather than after it.
    if (Is_airlevel(u.uz) || Levitation(state)) {
        throw new UnsupportedKickError(
            "kick_dumb()'s floating recoil, which needs hurtle()",
        );
    }
}

// C ref: dokick.c kick_nondoor() (974-1253). Its return value is dokick()'s,
// and every arm of it ends ECMD_TIME.
//
// avrg_attrib is dokick.c's third parameter and has no counterpart here. Two
// arms of this function read it, the secret door at 977 and the secret
// corridor at 1003, and one more caller does, kick_door() at 930; all three
// are refused, so dokick() computing it at 1327-1331 and passing it down would
// build a value nothing reads.
async function kick_nondoor(x, y, state) {
    const maploc = state.level.at(x, y);

    if (maploc.typ === SDOOR) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s secret-door arm, whose rn2(30) this stops "
            + 'before',
        );
    }
    if (maploc.typ === SCORR) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s secret-corridor arm, whose rn2(30) this stops "
            + 'before',
        );
    }
    if (IS_THRONE(maploc.typ)) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s throne arm, which needs mkgold() and "
            + 'fall_through()',
        );
    }
    if (IS_ALTAR(maploc.typ)) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s altar arm, which needs altar_wrath()",
        );
    }
    if (IS_FOUNTAIN(maploc.typ)) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s fountain arm, which needs water_damage()",
        );
    }
    if (IS_GRAVE(maploc.typ)) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s headstone arm, which needs disturb_grave()",
        );
    }
    if (maploc.typ === IRONBARS) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s iron-bars arm, which needs kick_ouch()",
        );
    }
    // 1135. An arboreal level makes STONE a tree, and this test precedes the
    // IS_STWALL() one below that would otherwise claim the same square.
    if (IS_TREE(maploc.typ, state)) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s tree arm, which needs rnd_treefruit_at() and "
            + 'scatter()',
        );
    }
    if (IS_SINK(maploc.typ)) {
        throw new UnsupportedKickError(
            "kick_nondoor()'s sink arm, which needs sink_backs_up()",
        );
    }
    if (maploc.typ === STAIRS || maploc.typ === LADDER
        || IS_STWALL(maploc.typ)) {
        // 1244. mklev.c mkstairs() writes LA_DOWN on a down staircase as well
        // as a down ladder, so kicking at either one is a dumb move; a wall or
        // anything leading up hurts instead.
        if (!IS_STWALL(maploc.typ) && maploc.ladder === LA_DOWN) {
            await kick_dumb(x, y, state);
            return ECMD_TIME;
        }
        throw new UnsupportedKickError(
            "kick_nondoor()'s wall and upward-stairs arm, which needs "
            + 'kick_ouch()',
        );
    }
    await kick_dumb(x, y, state);
    return ECMD_TIME;
}

// C ref: dokick.c dokick() (1257-1470), the #kick command. Its return value is
// rhack()'s: ECMD_CANCEL when the direction prompt answers nothing, ECMD_TIME
// once the kick lands.
export async function dokick(state = game) {
    const u = state.u;
    const species = state.youmonst?.data;

    // 1265-1316. Nine guards, each of which prints its own refusal, sets
    // no_kick and leaves through one shared `display_nhwindow(WIN_MESSAGE,
    // TRUE)` --More-- and ECMD_FAIL. C evaluates them as one else-if chain, so
    // a later condition is read only when every earlier one was false; these
    // sequential throws reproduce that order.
    if (nolimbs(species) || slithy(species)) {
        throw new UnsupportedKickError(
            "dokick()'s no-legs guard, which needs its --More-- flush",
        );
    }
    if (verysmall(species)) {
        throw new UnsupportedKickError(
            "dokick()'s too-small guard, which needs its --More-- flush",
        );
    }
    if (u.usteed) {
        throw new UnsupportedKickError(
            "dokick()'s steed prompt, which needs kick_steed()",
        );
    }
    if (Wounded_legs(state)) {
        throw new UnsupportedKickError(
            "dokick()'s wounded-legs guard, which needs legs_in_no_shape()",
        );
    }
    if (near_capacity(state) > SLT_ENCUMBER) {
        throw new UnsupportedKickError(
            "dokick()'s encumbrance guard, which needs its --More-- flush",
        );
    }
    if (species?.mlet === S_LIZARD) {
        throw new UnsupportedKickError(
            "dokick()'s lizard guard, which needs its --More-- flush",
        );
    }
    // 1288. C's condition is `u.uinwater && !rn2(2)`, so a submerged hero
    // reaches the rest of dokick() half the time; stopping on u.uinwater alone
    // keeps that draw out of the stream.
    if (u.uinwater) {
        throw new UnsupportedKickError(
            "dokick()'s underwater guard, whose rn2(2) this stops before",
        );
    }
    if (u.utrap) {
        throw new UnsupportedKickError(
            "dokick()'s trapped-hero guard, and with it the kick at the side "
            + 'of a pit at 1350-1353, which only a wall-passing hero reaches',
        );
    }
    if (sobj_at(BOULDER, u.ux, u.uy, state) && !Passes_walls(state)) {
        throw new UnsupportedKickError(
            "dokick()'s boulder guard, which needs its --More-- flush",
        );
    }

    // 1318-1321. getdir() prints "In what direction?" and writes u.dx/u.dy.
    // Neither refusal spends a turn.
    if (!await getdir(null, state)) return ECMD_CANCEL;
    if (!u.dx && !u.dy) return ECMD_CANCEL;

    const x = u.ux + u.dx;
    const y = u.uy + u.dy;
    // 1325. Written above everything that follows, the five ordered tests
    // included, so an arm that refuses below has still recorded the square,
    // exactly as C has.
    state.gk ??= {};
    state.gk.kickedloc = { x, y };
    // 1327-1331's avrg_attrib is not computed; kick_nondoor() says why.

    if (u.uswallow) {
        throw new UnsupportedKickError(
            "dokick()'s engulfed arm, whose rn2(3) this stops before",
        );
    }
    // 1355-1370. C returns ECMD_OK only when the square behind the hero offers
    // nothing to brace against, and otherwise falls through; this refuses the
    // whole block, which is the wider of the two.
    if (Levitation(state)) {
        throw new UnsupportedKickError(
            "dokick()'s levitation bracing check",
        );
    }

    const mtmp = isok(x, y) ? m_at(x, y, state) : null;
    if (mtmp) {
        throw new UnsupportedKickError(
            "dokick()'s monster arm, which needs maybe_kick_monster() and "
            + 'kick_monster()',
        );
    }

    // 1383-1384. Both run before the target square is examined at all, so an
    // arm refused below has still paid for them, exactly as C has.
    await wake_nearby({ state });
    u_wipe_engr(2, { state });

    if (!isok(x, y)) {
        throw new UnsupportedKickError(
            "dokick()'s off-the-map arm, which needs kick_ouch()",
        );
    }
    const maploc = state.level.at(x, y);

    unmap_invisible(x, y, state);
    // 1444. The XOR is written out because C wrote it: a hero inside water
    // kicking at dry land reaches the same message. u.uinwater is false by the
    // time control arrives here, since the guard above refused it.
    if ((is_pool(x, y, state) || maploc.typ === LAVAWALL)
        !== Boolean(u.uinwater)) {
        throw new UnsupportedKickError(
            "dokick()'s pool and lava arm",
        );
    }

    // 1452-1453. OBJ_AT() read off the per-square pile chain, so that a
    // supplied state rather than the module global answers for it.
    const pile = state.level?.objects?.[x]?.[y] ?? null;
    if (pile && (!Levitation(state) || Is_airlevel(u.uz) || Is_waterlevel(u.uz)
                 || sobj_at(BOULDER, x, y, state))) {
        throw new UnsupportedKickError(
            "dokick()'s object-pile arm, which needs kick_object() and with "
            + 'it every box, boulder and statue that arm handles',
        );
    }

    if (IS_DOOR(maploc.typ)) {
        throw new UnsupportedKickError(
            "dokick()'s door arm, which needs kick_door()",
        );
    }
    return await kick_nondoor(x, y, state);
}
