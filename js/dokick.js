// C ref: src/dokick.c. Seven of its functions are ported: dokick() (1257-1470),
// the #kick command; kick_door() (908-970), the door arm of dokick()'s final
// pair; kick_nondoor() (974-1253), the terrain chain dokick() ends on; and
// kick_dumb() (863-878), the one arm of that chain the earlier goal reached,
// plus kickdmg() (34-123), maybe_kick_monster() (126-143), and
// kick_monster() (146-487).
//
// dokick() is a guard chain, a direction prompt, and five ordered tests over
// the target square -- monsters, pools, objects, non-doors, doors. Only the
// last of those five continues into kick_door() or kick_nondoor().
// kick_door() covers the failure branch (959-969) fully and the non-trapped
// success branch (940-950): the shatter arm (ACURR(A_STR) > 18, rn2(5)==0,
// non-shop) and the crash-open fallback. Both set the doormask, exercise
// Strength, and call feel_newsym() and recalc_block_point(). The trapped-door
// arm (D_TRAPPED, b_trapped), the Levitation guard (kick_ouch), and the
// shop/town follow-ups are refused.
//
// kick_object(), really_kick_object(), watchman_thief_arrest(),
// watchman_door_damage(),
// otransit_msg() and drop_to() keep dokick.c company in C and have no ported
// caller; the arm that would reach each one names it in its refusal.

import { acurrstr, exercise, acurr } from './attrib.js';
import { getdir } from './cmd.js';
import {
    A_CON,
    A_DEX,
    A_STR,
    BLINDED,
    D_BROKEN,
    D_ISOPEN,
    D_NODOOR,
    D_TRAPPED,
    DEAF,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_TIME,
    HALF_PHDAM,
    IRONBARS,
    IS_DRAWBRIDGE,
    IS_OBSTRUCTED,
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
    KILLED_BY,
    LA_DOWN,
    LADDER,
    LAVAWALL,
    LEVITATION,
    PASSES_WALLS,
    FUMBLING,
    M_ATTK_DEF_DIED,
    M_ATTK_MISS,
    M_AP_TYPE,
    P_MARTIAL_ARTS,
    P_NONE,
    RIGHT_SIDE,
    SCORR,
    SDOOR,
    SHOPBASE,
    SLT_ENCUMBER,
    STAIRS,
    Upolyd,
    WOUNDED_LEGS,
    W_ARMF,
    M_AP_MONSTER,
    NO_TRAP_FLAGS,
    Trap_Killed_Mon,
    isok,
} from './const.js';
import { feel_location, feel_newsym, map_invisible, newsym,
    unmap_invisible } from './display.js';
import {
    legs_in_no_shape,
    set_wounded_legs,
} from './do.js';
import { u_wipe_engr } from './engrave.js';
import { game } from './gstate.js';
import {
    in_town, inv_weight, losehp, near_capacity, overexertion, weight_cap,
} from './hack.js';
import {
    bigmonst, can_teleport, haseyes, is_floater, is_flyer, is_giant,
    nohands, nolimbs, slithy, thick_skinned, verysmall,
} from './mondata.js';
import { abuse_dog } from './dog.js';
import {
    m_in_air, monflee, set_apparxy, youHear,
} from './monmove.js';
import {
    killed, maybe_mnexto, seemimic, setmangry, wake_nearby,
    wake_nearto,
} from './mon.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import {
    AT_KICK, PM_SASQUATCH, PM_SHADE, S_EEL, S_LIZARD,
} from './monsters.js';
import { sobj_at } from './obj.js';
import { BOULDER, KICKING_BOOTS } from './objects.js';
import { encumber_msg } from './pickup.js';
import { d, rn2, rnd, rnl } from './rng.js';
import { in_rooms } from './rooms.js';
import { is_pool } from './trap.js';
import { m_in_out_region } from './region.js';
import { mintrap } from './trap_effects.js';
import {
    displayPendingTtyMessageWindow,
    ttyPline,
} from './tty_message.js';
import { is_drawbridge_wall } from './startup_a11y.js';
import { canSpotMonster } from './startup_a11y.js';
import { note_unported } from './unported.js';
import { recalc_block_point } from './vision.js';
import { martial_bonus, special_dmgval, use_skill } from './weapon.js';
import {
    attack_checks, check_caitiff, damageum, find_roll_to_hit,
    missum, mon_maybe_unparalyze, passive,
} from './uhitm.js';
import { a_monnam, Monnam, mon_nam } from './do_name.js';
import { noteleport_level, goodpos } from './teleport.js';

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

// youprop.h:125 Deaf. HDeaf || EDeaf || u.uroleplay.deaf. The third term is
// the permanent-deafness roleplay option, matching js/sit.js and js/dothrow.js.
function Deaf(state) {
    const value = state.u?.uprops?.[DEAF];
    return Boolean(value?.intrinsic || value?.extrinsic)
        || Boolean(state.u?.uroleplay?.deaf);
}

// C ref: dokick.c:8-10, the martial() macro over is_bigfoot() at :7. A Samurai
// or a Monk answers TRUE from martial_bonus() without either later term being
// read, which is what keeps kick_dumb()'s rn2(3) out of the stream for them.
function martial(state) {
    return martial_bonus(state)
        || state.youmonst?.data?.pmidx === PM_SASQUATCH
        || state.uarmf?.otyp === KICKING_BOOTS;
}

// youprop.h:129 Fumbling. Both intrinsic and extrinsic sources count, with
// no blocked term.
function Fumbling(state) {
    const fumbling = state.u?.uprops?.[FUMBLING];
    return Boolean(fumbling?.intrinsic || fumbling?.extrinsic);
}

function kickEnvironment(state) {
    state.context ??= {};
    const random = { d, rn2, rnd, rnl };
    return {
        state,
        random,
        message: ttyPline,
        pline: ttyPline,
        unsupported: (what) => {
            throw new UnsupportedKickError(what);
        },
        nearCapacity: near_capacity,
        encumberMessage: encumber_msg,
        redraw: (x, y) => newsym(x, y),
        mInAir: m_in_air,
        heroDeaf: Deaf,
        youHear: (line, targetState) => youHear(line, targetState),
    };
}

// C ref: dokick.c kickdmg() (34-123). Damage for an ordinary, unpolymorphed
// kick, including pet abuse, martial-arts staggering, passive counterattack,
// and the trap-killed guard around killed().
export async function kickdmg(mon, clumsy, state = game) {
    const env = kickEnvironment(state);
    let mdx;
    let mdy;
    let dmg = Math.trunc(
        (acurrstr(state) + acurr(state, A_DEX) + acurr(state, A_CON)) / 15,
    );
    let kickSkill = P_NONE;
    let trapKilled = false;
    const boots = state.uarmf?.otyp === KICKING_BOOTS;
    const martialKick = martial(state);

    if (boots) dmg += 5;
    if (clumsy) dmg = Math.trunc(dmg / 2);
    if (thick_skinned(mon.data) || mon.data === state.mons?.[PM_SHADE])
        dmg = 0;

    const specialDmg = special_dmgval(
        state.youmonst, mon, W_ARMF, null, state, env,
    );
    if (mon.data === state.mons?.[PM_SHADE] && !specialDmg) {
        await ttyPline('The kick passes harmlessly through.', state);
        return;
    }

    if (M_AP_TYPE(mon)) seemimic(mon, state);
    check_caitiff(mon, state, env);

    if (mon.mtame) {
        await abuse_dog(mon, state, env.random);
        if (mon.mtame)
            await monflee(mon, dmg ? rnd(dmg) : 1, false, false, env);
        else
            mon.mflee = 0;
    }

    if (dmg > 0) {
        dmg = rnd(dmg);
        if (martialKick) {
            if (dmg > 1) kickSkill = P_MARTIAL_ARTS;
            dmg += rn2(Math.trunc(acurr(state, A_DEX) / 2) + 1);
        }
        await exercise(A_DEX, true, state, env.random);
    }
    dmg += specialDmg;
    if (state.uarmf) dmg += state.uarmf.spe ?? 0;
    dmg += state.u?.udaminc ?? 0;
    if (dmg > 0) mon.mhp -= dmg;

    if (mon.mhp >= 1 && martialKick && !bigmonst(mon.data) && !rn2(3)
        && mon.mcanmove && mon !== state.u.ustuck && !mon.mtrapped) {
        mdx = mon.mx + state.u.dx;
        mdy = mon.my + state.u.dy;
        if (goodpos(mdx, mdy, mon, 0, env)) {
            await ttyPline(`${Monnam(mon, state)} reels from the blow.`, state);
            if (await m_in_out_region(mon, mdx, mdy, env)) {
                const oldX = mon.mx;
                const oldY = mon.my;
                remove_monster(oldX, oldY, state);
                newsym(oldX, oldY);
                place_monster(mon, mdx, mdy, state);
                newsym(mdx, mdy);
                set_apparxy(mon, env);
                if (await mintrap(mon, NO_TRAP_FLAGS, env)
                    === Trap_Killed_Mon)
                    trapKilled = true;
            }
        }
    }

    passive(mon, state.uarmf, true, mon.mhp >= 1, AT_KICK, false,
        state, env);
    if (mon.mhp < 1 && !trapKilled)
        await killed(mon, state, env);
    if (kickSkill !== P_NONE) use_skill(kickSkill, 1, state);
}

// C ref: dokick.c maybe_kick_monster() (126-143). forcefight is scoped to
// attack_checks(), and the target is discarded when discovery, confirmation,
// or overexertion prevents the kick.
export async function maybe_kick_monster(mon, x, y, state = game) {
    if (!mon) return false;
    const env = kickEnvironment(state);
    state.gb ??= {};
    state.gb.bhitpos = { x, y };
    const saveForcefight = state.context?.forcefight;
    if (!mon.mpeaceful || !canSpotMonster(mon, state)) {
        state.context ??= {};
        state.context.forcefight = true;
    }
    try {
        const stopped = await attack_checks(mon, null, state, env);
        return !(stopped || await overexertion(state));
    } finally {
        state.context ??= {};
        state.context.forcefight = saveForcefight;
    }
}

// C ref: dokick.c kick_monster() (146-294). Resolve a kick against a monster,
// including polymorphed multiple kick attacks and the ordinary kick's weight,
// fumbling, block, evade, and damage branches.
export async function kick_monster(mon, x, y, state = game) {
    const env = kickEnvironment(state);
    const martialKick = martial(state);
    let clumsy = false;

    await setmangry(mon, true, env);

    if (Levitation(state) && !rn2(3) && verysmall(mon.data)
        && !is_flyer(mon.data)) {
        await ttyPline('Floating in the air, you miss wildly!', state);
        await exercise(A_DEX, false, state, env.random);
        passive(mon, state.uarmf, false, true, AT_KICK, false, state, env);
        return;
    }

    if (mon.mundetected
        || (M_AP_TYPE(mon) && M_AP_TYPE(mon) !== M_AP_MONSTER)) {
        if (M_AP_TYPE(mon)) seemimic(mon, state);
        mon.mundetected = 0;
        if (!canSpotMonster(mon, state)) map_invisible(x, y, state);
        else newsym(x, y);
        await ttyPline(
            `There is ${canSpotMonster(mon, state) ? a_monnam(mon, { state })
                : 'something hidden'} here.`,
            state,
        );
    }

    if (Upolyd(state.u) && attacktype(state.youmonst.data, AT_KICK)) {
        const counters = { attknum: 0, role_roll_penalty: 0 };
        // find_roll_to_hit() mutates the pointer-shaped counters object.
        const hitRoll = find_roll_to_hit(mon, AT_KICK, null, counters,
            state, env);
        mon_maybe_unparalyze(mon, env.random);
        for (const uattk of state.youmonst.data.mattk ?? []) {
            if (state.multi < 0) break;
            if (uattk.aatyp !== AT_KICK) continue;
            const dieroll = rnd(20);
            const specialDmg = special_dmgval(
                state.youmonst, mon, W_ARMF, null, state, env,
            );
            if (mon.data === state.mons?.[PM_SHADE] && !specialDmg) {
                await ttyPline(
                    `Your kick passes harmlessly through ${mon_nam(mon, state)}.`,
                    state,
                );
                break;
            }
            if (hitRoll > dieroll) {
                await ttyPline(`You kick ${mon_nam(mon, state)}.`, state);
                const sum = await damageum(mon, uattk, specialDmg, state, env);
                passive(mon, state.uarmf, sum !== M_ATTK_MISS,
                    !(sum & M_ATTK_DEF_DIED), AT_KICK, false, state, env);
                if (sum & M_ATTK_DEF_DIED) break;
            } else {
                await missum(mon, uattk,
                    hitRoll + counters.role_roll_penalty > dieroll,
                    state, env);
                passive(mon, state.uarmf, false, true, AT_KICK, false,
                    state, env);
            }
        }
        return;
    }

    const i = -inv_weight(state);
    const j = weight_cap(state);
    if (i < Math.trunc((j * 3) / 10)) {
        if (!rn2(i < Math.trunc(j / 10) ? 2
            : i < Math.trunc(j / 5) ? 3 : 4)) {
            if (martialKick) {
                clumsy = false;
            } else {
                await ttyPline('Your clumsy kick does no damage.', state);
                passive(mon, state.uarmf, false, true, AT_KICK, false,
                    state, env);
                return;
            }
        } else if (i < Math.trunc(j / 10)) {
            clumsy = true;
        } else if (!rn2(i < Math.trunc(j / 5) ? 2 : 3)) {
            clumsy = true;
        }
    }

    if (Fumbling(state)) clumsy = true;
    else if (state.uarm && state.objects?.[state.uarm.otyp]?.oc_bulky
             && acurr(state, A_DEX) < rnd(25)) clumsy = true;

    await ttyPline(`You kick ${mon_nam(mon, state)}.`, state);
    if (!rn2(clumsy ? 3 : 4) && (clumsy || !bigmonst(mon.data))
        && mon.mcansee && !mon.mtrapped && !thick_skinned(mon.data)
        && mon.data.mlet !== S_EEL && haseyes(mon.data)
        && mon.mcanmove && !mon.mstun && !mon.mconf && !mon.msleeping
        && mon.data.mmove >= 12) {
        if (!nohands(mon.data) && !rn2(martialKick ? 5 : 3)) {
            await ttyPline(
                `${Monnam(mon, state)} blocks your ${clumsy ? 'clumsy ' : ''}kick.`,
                state,
            );
            passive(mon, state.uarmf, false, true, AT_KICK, false, state, env);
            return;
        }
        maybe_mnexto(mon, state, env);
        if (mon.mx !== x || mon.my !== y) {
            unmap_invisible(x, y, state);
            const movement = can_teleport(mon.data) && !noteleport_level(mon, state)
                ? 'teleports'
                : is_floater(mon.data) ? 'floats'
                    : is_flyer(mon.data) ? 'swoops'
                        : (nolimbs(mon.data) || slithy(mon.data)) ? 'slides'
                            : 'jumps';
            await ttyPline(
                `${Monnam(mon, state)} ${movement}, ${clumsy ? 'easily' : 'nimbly'} evading your ${clumsy ? 'clumsy ' : ''}kick.`,
                state,
            );
            passive(mon, state.uarmf, false, true, AT_KICK, false, state, env);
            return;
        }
    }
    await kickdmg(mon, clumsy, state);
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
    if (martial(state) || acurr(state, A_DEX) >= 16 || rn2(3)) {
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

// C ref: hack.h Maybe_Half_Phys(), used by dokick.c kick_ouch() at :903.
// Half physical damage has no blocking term: either intrinsic or extrinsic
// Half_physical_damage halves the odd damage with C integer arithmetic.
function Maybe_Half_Phys(dmg, state) {
    const halfPhysical = state.u?.uprops?.[HALF_PHDAM];
    return (halfPhysical?.intrinsic || halfPhysical?.extrinsic)
        ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: dokick.c kickstr() (794-830). The killer string is selected from the
// object name when one exists; otherwise it describes the square saved by
// dokick(). `maploc === null` is the JavaScript representation of C's
// gn.nowhere square for an off-map kick.
export function kickstr(maploc, kickobjnam, state = game) {
    let what;

    if (kickobjnam) {
        what = kickobjnam;
    } else if (!maploc) {
        what = 'nothing';
    } else if (IS_DOOR(maploc.typ)) {
        what = 'a door';
    } else if (IS_TREE(maploc.typ, state)) {
        what = 'a tree';
    } else if (IS_STWALL(maploc.typ)) {
        what = 'a wall';
    } else if (IS_OBSTRUCTED(maploc.typ)) {
        what = 'a rock';
    } else if (IS_THRONE(maploc.typ)) {
        what = 'a throne';
    } else if (IS_FOUNTAIN(maploc.typ)) {
        what = 'a fountain';
    } else if (IS_GRAVE(maploc.typ)) {
        what = 'a headstone';
    } else if (IS_SINK(maploc.typ)) {
        what = 'a sink';
    } else if (IS_ALTAR(maploc.typ)) {
        what = 'an altar';
    } else if (IS_DRAWBRIDGE(maploc.typ)) {
        what = 'a drawbridge';
    } else if (maploc.typ === STAIRS) {
        what = 'the stairs';
    } else if (maploc.typ === LADDER) {
        what = 'a ladder';
    } else if (maploc.typ === IRONBARS) {
        what = 'an iron bar';
    } else {
        what = 'something weird';
    }
    return `kicking ${what}`;
}

// C ref: dokick.c kick_ouch() (881-906). This helper is shared by the wall
// and upward-stairs arm of kick_nondoor(), and by future terrain arms as they
// become reachable. The drawbridge lookup and floating recoil stay gaps until
// dbridge.c and the movement owner port those functions.
async function kick_ouch(x, y, kickobjnam, state) {
    const u = state.u;
    const maploc = isok(x, y) ? state.level.at(x, y) : null;

    await ttyPline('Ouch!  That hurts!', state);
    await exercise(A_DEX, false, state, { rn2 });
    await exercise(A_STR, false, state, { rn2 },
                   { encumberMessage: encumber_msg });
    if (isok(x, y)) {
        if (Blind(state)) feel_location(x, y, state);
        if (is_drawbridge_wall(x, y, state)) {
            await ttyPline('The drawbridge is unaffected.', state);
            // C discards find_drawbridge()'s return value, but its coordinate
            // arguments update gm.maploc. Record the unported mutation rather
            // than inventing a map update for this out-of-scope branch.
            note_unported('dbridge.c find_drawbridge');
        }
        await wake_nearto(x, y, 5 * 5, { state });
    }
    if (!rn2(3))
        await set_wounded_legs(RIGHT_SIDE, 5 + rnd(5), state);
    const dmg = rnd(acurr(state, A_CON) > 15 ? 3 : 5);
    await losehp(Maybe_Half_Phys(dmg, state), kickstr(maploc, kickobjnam,
        state), KILLED_BY, state);
    if (Is_airlevel(u.uz) || Levitation(state)) {
        throw new UnsupportedKickError(
            "kick_ouch()'s floating recoil, which needs hurtle()",
        );
    }
}

// C ref: dokick.c kick_door() (908-970). Kick a door. The failure branch
// (959-969) is fully implemented: the hero fails to break the door, hears
// "Whammm!!" or "Thwack!!", and gains Strength exercise. The non-trapped
// success branch (940-950) is implemented: the shatter arm (ACURR(A_STR) > 18,
// rn2(5)==0, non-shop) sets D_NODOOR; the crash-open fallback sets D_BROKEN.
// Both exercise Strength and call feel_newsym()/recalc_block_point(). The
// trapped-door arm (D_TRAPPED, b_trapped), the Levitation guard (kick_ouch),
// and the shop/town follow-ups are refused.
async function kick_door(x, y, avrg_attrib, state) {
    const maploc = state.level.at(x, y);
    const mask = maploc.flags || maploc.doormask || 0;

    // 914-918. Open, broken, or no-door: dumb kick. kick_dumb is already
    // ported.
    if (mask === D_ISOPEN || mask === D_BROKEN || mask === D_NODOOR) {
        await kick_dumb(x, y, state);
        return;
    }

    // 921-924. Not enough leverage to kick open doors while levitating.
    // kick_ouch() still reaches its unported floating recoil; refuse before
    // changing state because this guard is the Levitation-specific arm.
    if (Levitation(state)) {
        throw new UnsupportedKickError(
            "kick_door()'s Levitation guard, which needs kick_ouch()",
        );
    }

    // 926. Exercise dexterity for the attempt.
    await exercise(A_DEX, true, state, { rn2 });

    // 927. Polymorphed giants are doorbusters.
    const doorbuster = Upolyd(state.u) && is_giant(state.youmonst?.data);

    // 929-930. Door is known to be CLOSED or LOCKED. The success check
    // compares rnl(35) against the hero's attributes plus martial dexterity.
    if (doorbuster
        || (rnl(35) < avrg_attrib + (!martial(state) ? 0
            : acurr(state, A_DEX)))) {
        // 931. shopdoor is computed before the if-chain. in_rooms() draws no
        // RNG, so the stream position is unaffected.
        const shopdoor = in_rooms(x, y, SHOPBASE, state).length > 0;

        // 934-939. D_TRAPPED: the hero kicks a trapped door. b_trapped()
        // fires the trap and draws RNG; deferred.
        if (mask & D_TRAPPED) {
            throw new UnsupportedKickError(
                "kick_door()'s D_TRAPPED arm, which needs b_trapped()",
            );
        }

        // 940-944. Shatter: strong hero, rn2(5)==0, non-shop door.
        // C evaluates ACURR(A_STR) > 18 first, then !rn2(5), then !shopdoor.
        // Short-circuit: rn2(5) is drawn only when ACURR(A_STR) > 18.
        if (acurr(state, A_STR) > 18 && !rn2(5) && !shopdoor) {
            // 941. Soundeffect() is a tty-sound hook and writes nothing.
            await ttyPline(
                'As you kick the door, it shatters to pieces!', state,
            );
            await exercise(A_STR, true, state, { rn2 },
                           { encumberMessage: encumber_msg });
            maploc.doormask = D_NODOOR;
            maploc.flags = D_NODOOR;
        } else {
            // 946-949. Crash open: the fallback when the door does not shatter.
            // 946. Soundeffect() is a tty-sound hook and writes nothing.
            await ttyPline(
                'As you kick the door, it crashes open!', state,
            );
            await exercise(A_STR, true, state, { rn2 },
                           { encumberMessage: encumber_msg });
            maploc.doormask = D_BROKEN;
            maploc.flags = D_BROKEN;
        }

        // 951-952. Both shatter and crash-open run these.
        feel_newsym(x, y, state);
        recalc_block_point(x, y, state);

        // 953-956. Shop door: charge the hero for damage. Deferred.
        if (shopdoor) {
            throw new UnsupportedKickError(
                "kick_door()'s shop-door arm, which needs add_damage() and "
                + 'pay_for_damage()',
            );
        }

        // 957-958. In a town: the kick alerts the watch. Deferred.
        if (in_town(x, y, state)) {
            throw new UnsupportedKickError(
                "kick_door()'s watchman_thief_arrest arm, which needs "
                + 'get_iter_mons()',
            );
        }
        return;
    }

    // 959-969. Failure branch: the hero fails to break the door.
    // 960-961. Blind hero feels the door.
    if (Blind(state)) feel_location(x, y, state);

    // 962. Exercise Strength for the effort.
    await exercise(A_STR, true, state, { rn2 },
                   { encumberMessage: encumber_msg });

    // 966. "Whammm!!" when the hero can hear and rn2(3) is nonzero; "Thwack!!"
    // when deaf or the one-in-three rn2(3)==0 case. C evaluates the Deaf macro
    // before the rn2 short circuit: when Deaf is true, rn2(3) is never drawn.
    await ttyPline(`${(Deaf(state) || !rn2(3)) ? 'Thwack' : 'Whammm'}!!`,
                   state);

    // 967-968. In a town, the kick alerts the watch. The true arm calls
    // get_iter_mons_xy(watchman_door_damage, x, y), which is unported.
    if (in_town(x, y, state)) {
        throw new UnsupportedKickError(
            "kick_door()'s watchman_door_damage arm, which needs "
            + 'get_iter_mons_xy()',
        );
    }
}

// C ref: dokick.c kick_nondoor() (974-1253). Its return value is dokick()'s,
// and every arm of it ends ECMD_TIME.
//
// avrg_attrib is kick_nondoor()'s third parameter in C. Two arms of this
// function read it, the secret door at 977 and the secret corridor at 1003;
// both are refused, so the parameter is omitted from this signature. dokick()
// now computes avrg_attrib for kick_door(); kick_nondoor() does not receive it.
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
        await kick_ouch(x, y, '', state);
        return ECMD_TIME;
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
        await kick_ouch(x, y, '', state);
        return ECMD_TIME;
    }
    await kick_dumb(x, y, state);
    return ECMD_TIME;
}

// C ref: dokick.c dokick() (1257-1470), the #kick command. Its return value is
// rhack()'s: ECMD_CANCEL when the direction prompt answers nothing, ECMD_FAIL
// for a guard refusal, and ECMD_TIME once the kick lands.
export async function dokick(state = game) {
    const u = state.u;
    const species = state.youmonst?.data;

    // 1265-1316. Nine guards, each of which prints its own refusal, sets
    // no_kick and leaves through one shared `display_nhwindow(WIN_MESSAGE,
    // TRUE)` --More-- and ECMD_FAIL. C evaluates them as one else-if chain, so
    // a later condition is read only when every earlier one was false; the
    // remaining unported guards keep the source order through refusals.
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
        await legs_in_no_shape('kicking', false, state);
        await displayPendingTtyMessageWindow(state);
        return ECMD_FAIL;
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

    // 1327-1331. KMH -- Kicking boots always succeed; otherwise average the
    // three physical attributes. C's ACURRSTR folds 18/xx Strength down to
    // 19..25; ACURR for Dexterity and Constitution gives the effective value.
    // C's uarmf is a global; worn.js keeps it at state.uarmf.
    let avrg_attrib;
    if (state.uarmf?.otyp === KICKING_BOOTS) {
        avrg_attrib = 99;
    } else {
        avrg_attrib = Math.trunc(
            (acurrstr(state) + acurr(state, A_DEX)
             + acurr(state, A_CON)) / 3,
        );
    }

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
        if (await maybe_kick_monster(mtmp, x, y, state)) {
            await kick_monster(mtmp, x, y, state);
            return ECMD_TIME;
        }
        return ECMD_FAIL;
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
        await kick_door(x, y, avrg_attrib, state);
    } else {
        return await kick_nondoor(x, y, state);
    }
    return ECMD_TIME;
}
