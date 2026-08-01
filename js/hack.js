// Movement-adjacent world effects owned by hack.c.

import {
    ACCESSIBLE,
    A_CON,
    A_DEX,
    A_STR,
    BLINDED,
    COLD_RES,
    CONFUSION,
    CORR,
    DISINT_RES,
    DOOR,
    DO_MOVE,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    EXT_ENCUMBER,
    FAST,
    FIRE_RES,
    FLYING,
    FUMBLING,
    GOLD_SYM,
    HALLUC,
    HALLUC_RES,
    HEADSTONE,
    ICE,
    IS_AIR,
    IS_DOOR,
    IS_FURNITURE,
    IS_OBSTRUCTED,
    IS_STWALL,
    IS_TREE,
    IS_WALL,
    IS_WATERWALL,
    Is_airlevel,
    Is_waterlevel,
    IRONBARS,
    INTRINSIC,
    INVIS,
    LAVAWALL,
    LEVITATION,
    MAX_CARR_CAP,
    MAX_TYPE,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    PASSES_WALLS,
    POISON_RES,
    ROOM,
    RUN_CRAWL,
    RUN_LEAP,
    RUN_TPORT,
    SEE_INVIS,
    SHOCK_RES,
    SLEEP_RES,
    STAIRS,
    STEALTH,
    STONE,
    STUNNED,
    TELEPORT,
    TELEPORT_CONTROL,
    TIMER_OBJECT,
    Upolyd,
    VIBRATING_SQUARE,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    WT_ELF,
    WT_WEIGHTCAP_SPARE,
    WT_WEIGHTCAP_STRCON,
    WT_TOOMUCH_DIAGONAL,
    ZOMBIFY_MON,
    OVERLOADED,
    PROT_FROM_SHAPE_CHANGERS,
    isok,
} from './const.js';
import { acurrstr, effective_attribute, exercise } from './attrib.js';
import {
    classify_terrain,
    feel_location,
    flush_screen,
    newsym,
    wall_angle,
} from './display.js';
import { alwaysVisibleMonsterName, hliquid } from './do_name.js';
import { u_on_newpos } from './dungeon.js';
import { dist2, highc } from './hacklib.js';
import {
    can_reach_floor,
    engr_at,
    wipe_engr_at,
} from './engrave.js';
import { game } from './gstate.js';
import { doopen_indir } from './lock.js';
import {
    amorphous,
    bigmonst,
    is_flyer,
    is_hider,
    is_whirly,
    needspick,
    locomotion,
    noattacks,
    nohands,
    noncorporeal,
    passes_walls,
    slithy,
    strongmonst,
    throws_rocks,
    tunnels,
    verysmall,
} from './mondata.js';
import { is_pick, objectType, sobj_at } from './obj.js';
import {
    BOULDER,
    COIN_CLASS,
    CORPSE,
    CREDIT_CARD,
    LOCK_PICK,
    SKELETON_KEY,
    WATER_WALKING_BOOTS,
} from './objects.js';
import {
    PM_ELF,
    PM_GRID_BUG,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
    PM_VALKYRIE,
    PM_WIZARD,
} from './monsters.js';
import { curr_mon_load } from './mon.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import { can_fog, closed_door, onscary, youHear } from './monmove.js';
import { check_here } from './pickup.js';
import { in_out_region, inside_region } from './region.js';
import { rn2, rnd } from './rng.js';
import { check_special_room } from './rooms.js';
import {
    canSpotMonster,
    collectMonsterNoticeMessages,
    is_drawbridge_wall,
    messageAt,
    monsterVisible,
    sensesMonster,
} from './startup_a11y.js';
import { S_hcdoor, S_stone, S_vcdoor } from './symbols.js';
import {
    peek_timer,
    start_timer,
    stop_timer,
} from './timeout.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { do_attack, is_safemon } from './uhitm.js';
import { vision_recalc } from './vision.js';

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);

// C ref: hack.c weight_cap() (4293-4351), for the live unpolymorphed,
// non-levitating repeated-command boundary. Unlike the former startup-only
// helper, this reads effective Strength on every call, so hunger weakness can
// change carrying capacity before the next monster/allocation cycle.
//
// Three of C's branches are absent because nothing reaches them: the
// Boots_on/ELevitation deferral and its restore at 4337-4341, the Upolyd
// adjustment, and the EWounded_legs reduction, which needs a property no line
// of this port sets. The steed arm at 4325-4327 is live, because riding a
// strong monster is one of the three ways C reaches MAX_CARR_CAP -- the other
// two, Levitation and the air level, remain out of reach.
export function weight_cap(state = game) {
    let capacity = WT_WEIGHTCAP_STRCON * (
        acurrstr(state) + effective_attribute(state, A_CON)
    ) + WT_WEIGHTCAP_SPARE;
    if (state.u.usteed && strongmonst(state.u.usteed.data))
        capacity = MAX_CARR_CAP;
    else
        capacity = Math.min(capacity, MAX_CARR_CAP);
    return Math.max(Math.trunc(capacity), 1); /* never return 0 */
}

function inventory_weight(state) {
    let weight = 0;
    for (let object = state.invent; object; object = object.nobj) {
        if (object.oclass === COIN_CLASS) {
            weight += Math.trunc((Math.trunc(object.quan) + 50) / 100);
        } else if (object.otyp !== BOULDER
            || !throws_rocks(state.youmonst?.data)) {
            weight += Math.trunc(object.owt ?? 0);
        }
    }
    return weight;
}

function capacity_from_excess(excess, capacity) {
    if (excess <= 0) return 0;
    if (capacity <= 1) return OVERLOADED;
    return Math.min(
        Math.trunc(excess * 2 / capacity) + 1,
        OVERLOADED,
    );
}

// C ref: hack.c inv_weight(). The inventory is stable throughout the current
// repeated-command boundary, but its capacity component is deliberately live.
export function inv_weight(state = game) {
    state.gw ??= {};
    state.gw.wc = weight_cap(state);
    return inventory_weight(state) - state.gw.wc;
}

// C ref: hack.c inv_cnt() (4494-4507). Counts inventory slots, optionally
// including the gold one. C selects gold by invlet rather than by class, so a
// non-gold object that somehow carries '$' would be skipped too.
export function inv_cnt(incl_gold, state = game) {
    let count = 0;
    for (let obj = state.invent; obj; obj = obj.nobj) {
        if (incl_gold || obj.invlet !== GOLD_SYM) count++;
    }
    return count;
}

// C ref: hack.c calc_capacity() and near_capacity().
export function calc_capacity(extraWeight = 0, state = game) {
    const excess = inv_weight(state) + Math.trunc(extraWeight);
    return capacity_from_excess(excess, state.gw.wc);
}

export function near_capacity(state = game) {
    return calc_capacity(0, state);
}

// C ref: hack.c check_capacity() (4398-4408). Answers whether the hero is too
// loaded to act, and says so first. C's `str` is a caller-supplied replacement
// line printed through pline1(); a null one takes the You_cant() default.
export async function check_capacity(str, state = game) {
    if (near_capacity(state) >= EXT_ENCUMBER) {
        await ttyPline(
            str ?? "You can't do that while carrying so much stuff.",
            state,
        );
        return true;
    }
    return false;
}

// near_capacity() without the cache write. hack.c's inv_weight() assigns
// gw.wc as a side effect, and calc_capacity() then reads it, so calling
// near_capacity() early would refresh the live cache before the elapsed-turn
// admission pass has decided whether the turn may run at all. This returns the
// same number for the same state and leaves state.gw.wc untouched; the
// cache-writing call stays at allmain.c's source-ordered point, after monster
// actions are admitted. Use near_capacity() anywhere C calls it, and this only
// where the read must not be observable.
export function projected_capacity(state = game) {
    const capacity = weight_cap(state);
    return capacity_from_excess(
        inventory_weight(state) - capacity,
        capacity,
    );
}

export class UnsupportedHeroMoveBoundaryError extends Error {
    constructor(reason) {
        super(`unsupported hero move: ${reason}`);
        this.name = 'UnsupportedHeroMoveBoundaryError';
        this.reason = reason;
    }
}

// C ref: hack.c rounddiv() (4549-4573). Integer division that rounds a
// remainder of exactly half away from zero, and carries the sign of the
// quotient rather than C's truncation. eat.c doeat() divides a meal's
// remaining nutrition by its full nutrition through this.
export function rounddiv(x, y) {
    let divsgn = 1;
    if (y === 0) throw new RangeError('division by zero in rounddiv');
    if (y < 0) {
        divsgn = -divsgn;
        y = -y;
    }
    if (x < 0) {
        divsgn = -divsgn;
        x = -x;
    }
    let r = Math.trunc(x / y);
    const m = x % y;
    if (2 * m >= y) r++;
    return divsgn * r;
}

function propertyActiveUnblocked(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

function propertyIntrinsic(state, property) {
    return Boolean(state.u?.uprops?.[property]?.intrinsic);
}

// C ref: hack.c u_maybe_impaired() (2417-2421). youprop.h:81 and :84 define
// both Stunned and Confusion as the bare intrinsic field, with no extrinsic or
// blocked term. rn2(5) is drawn only for a confused hero, so an unimpaired one
// costs no randomness.
export function u_maybe_impaired(state = game) {
    return Boolean(propertyIntrinsic(state, STUNNED)
        || (propertyIntrinsic(state, CONFUSION) && !rn2(5)));
}

// C ref: youprop.h's plain `HFoo || EFoo` property macros, such as
// Passes_walls and Fumbling, which carry no blocked term.
function propertyPresent(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function heroHallucinating(state) {
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return propertyIntrinsic(state, HALLUC)
        && !Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: hack.c monster_nearby(). This deliberately has stricter concealment,
// disposition, helplessness, and scare checks than canspotmon().
export function monsterNearby(state = game) {
    const { ux, uy } = state.u;
    const hallucinating = heroHallucinating(state);
    for (let x = ux - 1; x <= ux + 1; ++x) {
        for (let y = uy - 1; y <= uy + 1; ++y) {
            if (!isok(x, y) || (x === ux && y === uy)) continue;
            const monster = m_at(x, y, state);
            if (!monster) continue;
            const appearance = (monster.m_ap_type ?? 0) & M_AP_TYPMASK;
            if (appearance === M_AP_FURNITURE
                || appearance === M_AP_OBJECT) {
                continue;
            }
            if (!hallucinating
                && (monster.mpeaceful || noattacks(monster.data))) {
                continue;
            }
            if (is_hider(monster.data) && monster.mundetected) continue;
            if (monster.msleeping || !monster.mcanmove) continue;
            if (onscary(ux, uy, monster, state)) continue;
            if (canSpotMonster(monster, state)) return true;
        }
    }
    return false;
}

// C ref: hack.c end_running(TRUE). Finite movement, hunger transitions, and
// safe-pet refusal share this owner for run, travel, movement-repeat, and count
// cancellation.
//
// The status catch-up belongs here and nowhere else. moveloop_core() suppresses
// the turn counter while context.run is set, and classify_terrain() suppresses
// its own disp.botl write for the same reason, so both have to be made up once
// the run ends. nomul() masks half of that by setting disp.botl itself, but the
// direct callers in js/uhitm.js and js/eat.js reach here without it.
//
// gt.travelmap has no ported counterpart, so its selection_free() is absent.
export function endRunning(state = game) {
    if (state.context.run) {
        state.context.run = 0;
        state.disp ??= {};
        if (state.flags?.time) state.disp.time_botl = true;
        if (state.flags?.terrainstatus) {
            state.iflags.terrain_typ = MAX_TYPE; /* "none of the above" */
            classify_terrain(state);
        }
    }
    state.context.travel = 0;
    state.context.travel1 = 0;
    state.context.mv = 0;
    if (state.multi > 0) state.multi = 0;
}

// C ref: hack.c nomul(). Interrupts a multi-turn action: a run, a travel, or
// a counted repeat. Its cmdq_clear(CQ_CANNED) has no ported command queue,
// and gm.multi_reason/gm.multireasonbuf have no ported reader, so neither is
// represented here.
export function nomul(nval, state = game) {
    const multi = state.multi ?? 0;
    if (multi < nval) return; /* This is a bug fix by ab@unido */
    state.disp ??= {};
    if (multi >= 0) state.disp.botl = true;
    state.u.uinvulnerable = false;
    state.u.usleep = 0;
    state.multi = nval;
    endRunning(state);
}

// C ref: hack.c u_rooted() (1693-1705). TRUE for a hero whose current form
// cannot move at all, which do.c dodown() and doup() and sit.c dosit() test
// before anything else. mmove is the permonst speed field, so only a
// polymorphed hero can answer TRUE; js/u_init.js is the port's only writer of
// u.umonnum and it sets u.umonnum === u.umonster, so no admitted path reaches
// the message.
export async function u_rooted(state = game) {
    const species = state.youmonst?.data;
    if (!species?.mmove) {
        const inPlace = propertyActiveUnblocked(state, LEVITATION)
            || Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz);
        await ttyPline(
            `You are rooted ${inPlace ? 'in place' : 'to the ground'}.`,
            state,
        );
        nomul(0, state);
        return true;
    }
    return false;
}

// A hit point loss whose consequences this port has not reached.
export class UnsupportedHitPointLossError extends Error {
    constructor(reason) {
        super(`unsupported hit point loss: ${reason}`);
        this.name = 'UnsupportedHitPointLossError';
        this.reason = reason;
    }
}

// C ref: hack.c maybe_wail() (4210-4243). svm.moves is the turn counter and
// gw.wailmsg the turn the last wail was printed on, so the first 50 turns of a
// game are silent and the message repeats at most once every 51 turns.
//
// The powers[] tally reads the intrinsic field alone, not the property macros:
// an extrinsic granted by worn equipment does not count.
const WAIL_POWERS = Object.freeze([
    TELEPORT, SEE_INVIS, POISON_RES, COLD_RES, SHOCK_RES, FIRE_RES,
    SLEEP_RES, DISINT_RES, TELEPORT_CONTROL, STEALTH, FAST, INVIS,
]);

async function maybe_wail(state) {
    if (state.moves <= (state.wailmsg ?? 0) + 50) return;

    state.wailmsg = state.moves;
    const role = state.urole?.mnum;
    if (role === PM_WIZARD || state.urace?.mnum === PM_ELF
        || role === PM_VALKYRIE) {
        const who = (role === PM_WIZARD || role === PM_VALKYRIE)
            ? state.urole.name.m : 'Elf';

        if (state.u.uhp === 1) {
            await ttyPline(`${who} is about to die.`, state);
        } else {
            let powercnt = 0;
            for (const power of WAIL_POWERS) {
                if (state.u.uprops?.[power]?.intrinsic & INTRINSIC)
                    ++powercnt;
            }
            await ttyPline(
                powercnt >= 4
                    ? `${who}, all your powers will be lost...`
                    : `${who}, your life force is running out.`,
                state,
            );
        }
    } else {
        // Soundeffect() is a no-op without a sound library, which the tty
        // build this port matches is.
        const line = youHear(
            state.u.uhp === 1
                ? 'the wailing of the Banshee...'
                : 'the howling of the CwnAnnwn...',
            state,
        );
        if (line !== null) await ttyPline(line, state);
    }
}

// C ref: hack.c showdamage() (4245-4253). options.c leaves iflags.showdamage
// off, so an ordinary game prints nothing here.
async function showdamage(dmg, state) {
    if (!state.iflags?.showdamage || !dmg) return;

    await ttyPline(`[HP ${-dmg}, ${Upolyd(state.u) ? state.u.mh : state.u.uhp}`
        + ' left]', state);
}

// C ref: hack.c losehp() (4255-4290). `knam` and `k_format` describe the
// killer and are read only on the death branch, which stops below.
export async function losehp(n, knam, k_format, state = game) {
    state.disp ??= {};
    state.disp.botl = true; /* u.uhp or u.mh is changing */
    endRunning(state);
    if (Upolyd(state.u)) {
        // Nothing in this port polymorphs the hero, so u.mh, rehumanize() and
        // the Unchanging wail have no reachable caller. The branch stops
        // rather than duplicating hit points into a second unowned field.
        throw new UnsupportedHitPointLossError('damage to a polymorphed hero');
    }

    state.u.uhp -= n;
    await showdamage(n, state);
    // Widening this comparison to >= would assign u.uhpmax to itself, so no
    // test can tell the two apart.
    if (state.u.uhp > state.u.uhpmax)
        state.u.uhpmax = state.u.uhp; /* perhaps n was negative */
    if (state.u.uhp < 1) {
        // svk.killer, urgent_pline("You die...") and done(DIED) own the whole
        // end of game, which no part of this milestone covers. knam and
        // k_format are consumed here and nowhere else, so a surviving hero
        // never observes them.
        throw new UnsupportedHitPointLossError(
            `death, killer "${knam}" in format ${k_format}`,
        );
    } else if (n > 0 && state.u.uhp * 10 < state.u.uhpmax) {
        await maybe_wail(state);
    }
}

function heroIsBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean(
        (blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked,
    );
}

// C ref: hack.c test_move()'s IS_OBSTRUCTED entry test, narrowed to the wall
// and rock destinations the ported half of test_move() refuses. It answers
// TRUE exactly where test_move() gives up without changing the game, which is
// why the command admission seam can skip its destination checks there and
// leave the refusal to domove().
//
// It used to carry a `loc.doormask & (D_CLOSED | D_LOCKED)` term as well. The
// term was dead rather than wrong in general: js/mklev.js dosdoor() (2545)
// writes only `loc.flags` for an ordinary dungeon door, so it answered FALSE
// for those, though create_door() (2731) and the special-level door path (951)
// do write `doormask` and would have satisfied it. Either way it is
// unreachable now for the one caller there is. blocksMove() is called only
// from preflightDomoveDestination(), whose else-if chain claims every closed
// or locked door in its closed_door() arm before reaching here, so the deleted
// term could never have fired. test_move() is not a second caller: it refuses
// stone and walls through its own inline test, and additionally does not share
// blocksMove()'s TRUE answer for a missing location.
function blocksMove(x, y, state) {
    const loc = state.level?.at(x, y);
    return !loc || loc.typ === STONE || IS_WALL(loc.typ);
}

// C ref: hack.c:1140-1141, the condition on test_move()'s testdiag arm. A
// doorway that still has its door refuses a diagonal entry.
//
// block_door() is omitted. shk.c:5791 answers FALSE unless <x,y> lies in a
// shop the hero is standing in and owes for, and mklev.c:1349 gates every
// randomly placed shop on `u_depth > 1`, so no level this boundary reaches
// holds one. blocksDiagonalDoorwayExit()'s block_entry() (shk.c:5826) is
// absent for the same reason, and additionally needs a D_BROKEN hero square.
function blocksDiagonalDoorwayEntry(ux, uy, x, y, state) {
    return Boolean((x - ux) && (y - uy)
        && !propertyPresent(state, PASSES_WALLS)
        && !doorless_door(state.level?.at(x, y)));
}

// C ref: hack.c:1208-1209. The mirror rule: a doorway that still has its door
// refuses a diagonal exit, whatever the destination is.
function blocksDiagonalDoorwayExit(ux, uy, x, y, state) {
    const source = state.level?.at(ux, uy);
    return Boolean((x - ux) && (y - uy)
        && !propertyPresent(state, PASSES_WALLS)
        && IS_DOOR(source?.typ) && !doorless_door(source));
}

// TRUE where test_move() refuses the step through one of its two diagonal
// doorway rules. Both refusals spend no time and change nothing, exactly like
// the wall blocksMove() reports, so the admission seam admits the command and
// leaves the refusal to domove().
//
// The two arms C reaches before either rule decide nothing here: its obstacle
// arm (1011) and its closed-door arm (1075) both return before testdiag, and
// the seam has its own branches for them.
function refusedDiagonalDoorway(x, y, state) {
    const { ux, uy } = state.u;
    const destination = state.level?.at(x, y);
    if (!destination) return false;
    if (IS_OBSTRUCTED(destination.typ) || destination.typ === IRONBARS)
        return false;
    if (IS_DOOR(destination.typ)) {
        if (closed_door(x, y, state)) return false;
        if (blocksDiagonalDoorwayEntry(ux, uy, x, y, state)) return true;
    }
    return blocksDiagonalDoorwayExit(ux, uy, x, y, state);
}

// This repeated-command boundary owns entry into an unoccupied ROOM, CORR, or
// STAIRS square, or a doorway whose mask is exactly D_NODOOR or D_ISOPEN,
// plus the ordinary single-object description produced when autopickup is
// disabled. These checks are a temporary admission seam in front of
// hack.c:domove_core(); each rejected branch will move to its upstream owner
// when that behavior is ported.
export function requireSimpleHeroDestination(x, y, state) {
    if (m_at(x, y, state))
        throw new UnsupportedHeroMoveBoundaryError(
            'hero combat or displacement',
        );

    const location = state.level?.at(x, y);
    // hack.c test_move() admits STAIRS untouched: it is neither
    // IS_OBSTRUCTED nor IS_DOOR, so no branch there applies to it. A DOOR
    // that is not closed_door() reaches only test_move()'s testdiag arm,
    // which refuses a diagonal entry and allows an orthogonal one; the
    // diagonal case never arrives here, because preflightDomoveDestination()
    // admits it for test_move() to refuse.
    // Only D_NODOOR and D_ISOPEN are admitted, the two masks recorded against
    // the C program. D_BROKEN behaves like D_NODOOR in doorless_door() but
    // differs in dfeature_at(), which returns the literal "broken door" where
    // the other two go through the cmap; sp_lev.c rnddoor() can produce it on
    // a themed-room door, so it is refused rather than assumed equivalent.
    // D_TRAPPED is excluded too: C admits an open trapped door here because
    // its trap fires from doopen(), not from entry, but that path is not
    // traced yet, so it stays refused.
    const mask = doorMask(location);
    const doorway = location?.typ === DOOR
        && (mask === D_NODOOR || mask === D_ISOPEN);
    const ordinaryDestination = location
        && (location.typ === ROOM
            || location.typ === CORR
            || location.typ === STAIRS
            || doorway);
    if (!ordinaryDestination) {
        throw new UnsupportedHeroMoveBoundaryError(
            'door or special terrain movement',
        );
    }
    // pickup.c pickup() returns before look_here() when the square holds no
    // object, running only describe_decor() and read_engr_at(). So a bare
    // staircase or doorway prints nothing with mention_decor off. With it on,
    // describe_decor() owns the line and tracks iflags.prev_decor, neither of
    // which is ported.
    if (state.flags?.mention_decor
        && (location.typ === STAIRS || doorway)) {
        throw new UnsupportedHeroMoveBoundaryError('decor description');
    }
    const floorObject = state.level?.objects?.[x]?.[y] ?? null;
    if (sobj_at(BOULDER, x, y, state))
        throw new UnsupportedHeroMoveBoundaryError('boulder movement');
    if (floorObject && state.flags?.pickup)
        throw new UnsupportedHeroMoveBoundaryError('automatic pickup');
    if (floorObject?.nexthere)
        throw new UnsupportedHeroMoveBoundaryError('floor object pile');
    // invent.c look_here() computes dfeature_at() unconditionally and prints
    // it before "You see here" when the square holds exactly one object.
    // dfeature_at() describes a stairway through stairs_description() and
    // every IS_DOOR mask through the cmap, and returns 0 for ROOM and CORR,
    // so only the two terrain types admitted above can produce that line.
    // Neither dfeature_at() nor stairs_description() is ported.
    if (floorObject && (location.typ === STAIRS || doorway))
        throw new UnsupportedHeroMoveBoundaryError(
            'terrain feature description',
        );
    if (t_at(x, y, state))
        throw new UnsupportedHeroMoveBoundaryError('trap activation');

    for (const region of state.level?.regions ?? []) {
        if (region.attach_2_u) continue;
        if (Boolean(region.hero_inside) !== inside_region(region, x, y))
            throw new UnsupportedHeroMoveBoundaryError('region crossing');
    }
    if (engr_at(x, y, state))
        throw new UnsupportedHeroMoveBoundaryError('engraving interaction');
}

function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

// C ref: hack.c doorless_door(). A doorway lacks its door when no mask bit
// outside D_NODOOR and D_BROKEN is set. Both of test_move()'s diagonal rules
// turn on this predicate, so they read it here rather than testing masks
// themselves. The Is_rogue_level() arm is not ported: the rogue level is not
// reachable from this boundary.
function doorless_door(location) {
    return location?.typ === DOOR
        && (doorMask(location) & ~(D_NODOOR | D_BROKEN)) === 0;
}

// C ref: hack.c:1097, the autoopen test. TRUE where test_move() falls through
// to the bump arm and its "That door is closed." sibling instead of pulling at
// the door. Only the two terms this port admits are here; the three it refuses
// are named in requireAutoopenClosedDoor(), which rejects them before any
// caller asks this.
function autoopenSuppressed(state, run) {
    return !state.flags?.autoopen || Boolean(run);
}

// This seam owns the two routes through hack.c test_move()'s closed-door arm
// (1074-1137) that the port covers: a walking hero in ordinary form with
// `autoopen` set, pulling at a door lock.c doopen_indir() (780-923) can answer
// for, and the same hero with the pull suppressed, who bumps into the door or
// is told it is closed. Every other state those two functions branch on stops
// here, named for the C condition that diverges. Both the command admission
// seam and test_move() call it, as they do requireSimpleHeroDestination().
// `run` is a parameter rather than a read of `state.context.run` because the
// admission seam runs before `executeMovement()` commits the intent: at
// `js/cmd.js` the preflight is called first and `state.context.run = run` only
// afterwards, so the field still holds the previous command's value there.
// `runStopsBeforeMonster()` takes `run` for the same reason.
function requireAutoopenClosedDoor(x, y, state, run) {
    const data = state.youmonst?.data;
    const u = state.u;
    // hack.c:1076 feels the square before the branch, feel_newsym() at
    // lock.c:914 takes its blind arm, and Blind is the first of the four
    // terms hack.c:1113-1114 gates the bump on. All three stay refused.
    // Blindness cannot decide this arm on its own, but the reason is narrower
    // than it looks: of the gate's other three terms, Stunned and Fumbling are
    // refused below in this same function, so `ACURR(A_DEX) < 10` is the only
    // live one and is what keeps the bump arm reachable at all. If a later
    // slice narrows or moves the Dexterity test, the arm goes dark. Blindness's
    // only start-of-game source is optlist.h:211's `permablind`, which sets
    // u.uroleplay.blind at u_init.c:1027 and changes what every square of the
    // level draws from turn one, well outside this arm.
    if (heroIsBlind(state)) {
        throw new UnsupportedHeroMoveBoundaryError('blind door opening');
    }
    // hack.c:1078-1090, the four forms that pass a closed door instead of
    // opening it. can_ooze() and the "can't squeeze your possessions through"
    // notice both start at amorphous(), so refusing that covers them; a dwarf
    // tunnels() but also needspick(), which is why both are read.
    if (propertyPresent(state, PASSES_WALLS)
        || amorphous(data)
        || u.uinwater
        || (tunnels(data) && !needspick(data))) {
        throw new UnsupportedHeroMoveBoundaryError(
            'door bypassed rather than opened',
        );
    }
    // hack.c:1097's three remaining suppression terms. Each of them lands in
    // the same bump arm that `!flags.autoopen` and a nonzero svc.context.run
    // reach, but the hero carrying one diverges before test_move() is called
    // at all: domove_core() runs impaired_movement() (hack.c:2425) first,
    // which rerolls the step through confdir() for a stunned or confused hero
    // and draws u_maybe_impaired()'s rn2(5) for the confused one. Neither is
    // ported. Fumbling joins them because nothing in this port creates it:
    // `grep -rn FUMBLING js/` finds readers only, so admitting it would port a
    // branch against a state the game cannot reach.
    if (propertyIntrinsic(state, CONFUSION)
        || propertyIntrinsic(state, STUNNED)) {
        throw new UnsupportedHeroMoveBoundaryError('impaired movement');
    }
    if (propertyPresent(state, FUMBLING)) {
        throw new UnsupportedHeroMoveBoundaryError('fumbling movement');
    }
    // hack.c:1115-1117's "You can't lead <steed> through that closed door."
    // needs y_monnam(). That is the whole live basis: it sits inside the
    // Dexterity gate, so a mounted hero with ACURR(A_DEX) >= 10 takes
    // hack.c:1132's "That door is closed." exactly as an unmounted one does,
    // and lock.c:884's kick guard cannot decide the pull either while the
    // autounlock refusal below stands. The guard is therefore deliberately
    // wider than C, refusing every mounted case to own the one that diverges.
    if (u.usteed) {
        throw new UnsupportedHeroMoveBoundaryError('closed door on a steed');
    }
    // domove_core() reaches domove_bump_mon() and domove_attackmon_at()
    // (2786-2796) before test_move(), and this port's domove() calls
    // test_move() first, so a monster standing on the closed door would take
    // the door arm here where C attacks it. lock.c:826
    // stumble_on_door_mimic() is the same square seen from doopen_indir().
    //
    // This guard is defensive rather than live: preflightDomoveDestination()
    // tests `m_at()` before its closed_door() arm, so the seam refuses a
    // monster-occupied door as combat and nothing reaches here. It exists for
    // the test_move() call inside domove(), which has no such ordering.
    if (m_at(x, y, state)) {
        throw new UnsupportedHeroMoveBoundaryError('monster on a closed door');
    }
    // A held hero never gets as far as test_move(): domove_core():2830 hands
    // the step to trapmove() and returns unless it escapes. lock.c:815 refuses
    // the pull for the same hero from the other side.
    if (u.utrap) {
        throw new UnsupportedHeroMoveBoundaryError('held hero movement');
    }
    // hack.c:1097. The remaining refusals belong to doopen_indir(), which only
    // the pull reaches; the bump arm and its "That door is closed." sibling
    // leave the door alone, so none of them applies there.
    if (autoopenSuppressed(state, run)) return;
    // lock.c:790 nohands() and :898 verysmall().
    if (nohands(data) || verysmall(data)) {
        throw new UnsupportedHeroMoveBoundaryError('door opening interrupted');
    }
    // lock.c:826. is_drawbridge_wall() makes the door a portcullis and diverts
    // the whole function into its drawbridge messages. Call the ported
    // predicate rather than an adjacency test: dbridge.c:148-159 requires the
    // neighbour's DB_DIR to point back at this square, so a bare adjacency
    // check refuses a superset, including a DOOR whose neighbouring bridge
    // faces away from it.
    if (is_drawbridge_wall(x, y, state)) {
        throw new UnsupportedHeroMoveBoundaryError('portcullis');
    }
    // monmove.c closed_door() is a bit test, not an equality test: it answers
    // TRUE for any mask carrying D_LOCKED or D_CLOSED, D_TRAPPED included. So
    // this guard is what selects the masks js/lock.js answers for, rather than
    // a restatement of closed_door(); deleting it as redundant would let a
    // trapped door reach the pull.
    //
    // D_CLOSED takes lock.c:904's roll and D_LOCKED takes the lock.c:855
    // message switch. D_LOCKED | D_TRAPPED joins them because lock.c:855 tests
    // only D_CLOSED, so 0x18 enters the same switch, prints the same line and
    // returns at :895 -- the b_trapped() and add_damage() tail at :907-911 is
    // inside the "known to be CLOSED" arm and needs D_CLOSED to run.
    // D_CLOSED | D_TRAPPED stays refused, because its roll really does reach
    // that tail on success.
    const mask = doorMask(state.level?.at(x, y));
    if (mask !== D_CLOSED && mask !== D_LOCKED
        && mask !== (D_LOCKED | D_TRAPPED)) {
        throw new UnsupportedHeroMoveBoundaryError('trapped or unusual door');
    }
    if (mask !== D_CLOSED) {
        // lock.c:876-883. A locked door offers itself to flags.autounlock,
        // whose apply-key arm runs pick_lock() when autokey(TRUE) finds a
        // tool. autokey() (lock.c:289) returns one exactly when inventory
        // holds a skeleton key, lock pick or credit card; its quest-artifact
        // and magic-key preferences only choose among those three, and
        // pick_lock() is the sole caller that observes which one, so the
        // function is deferred with it.
        if (carriesUnlockingTool(state)) {
            throw new UnsupportedHeroMoveBoundaryError('door unlocking tool');
        }
        // lock.c:884-893. AUTOUNLOCK_KICK asks "Kick it?" through ynq() and
        // queues dokick. options.c:1074 initializes flags.autounlock to
        // AUTOUNLOCK_APPLY_KEY and js/options.js deliberately leaves an
        // explicit `autounlock` value uninterpreted on state.flags, so an
        // absent field is the only state whose bits this port knows.
        if (state.flags?.autounlock !== undefined) {
            throw new UnsupportedHeroMoveBoundaryError('autounlock setting');
        }
    }
}

// The inventory test behind lock.c autokey(TRUE) != 0, without picking the
// tool. Every branch of that function starts from one of these three object
// types, so carrying any of them is what routes a locked door into
// pick_lock().
function carriesUnlockingTool(state) {
    for (let object = state.invent; object; object = object.nobj) {
        if (object.otyp === SKELETON_KEY
            || object.otyp === LOCK_PICK
            || object.otyp === CREDIT_CARD) {
            return true;
        }
    }
    return false;
}

function requireOrdinaryStartingPetSwap(monster, x, y, state) {
    const startingPet = monster
        && monster.m_id === state.context?.startingpet_mid
        && STARTING_PETS.has(monster.data?.pmidx)
        && monster.mtame
        && monster.mpeaceful;
    if (!startingPet || !is_safemon(monster, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'hero combat or displacement',
        );
    }
    const ordinaryTimedFlee = !monster.mflee
        || (Number.isInteger(monster.mfleetim)
            && monster.mfleetim >= 1
            && monster.mfleetim <= 127);
    const specialState = monster.mhp < 1
        || !monster.mcanmove
        || monster.mfrozen
        || monster.msleeping
        || monster.mtrapped
        || !ordinaryTimedFlee
        || monster.meating
        || monster.wormno;
    if (specialState) {
        throw new UnsupportedHeroMoveBoundaryError(
            'hero combat or exceptional pet displacement',
        );
    }

    const destination = state.level?.at(x, y);
    const ordinaryDestination = destination
        && (destination.typ === ROOM
            || destination.typ === CORR
            || (destination.typ === DOOR && doorMask(destination) === 0));
    if (!ordinaryDestination) {
        throw new UnsupportedHeroMoveBoundaryError(
            'door or special terrain movement',
        );
    }

    const source = state.level?.at(state.u.ux, state.u.uy);
    const sourceAccessible = source
        && ACCESSIBLE(source.typ)
        && !(source.typ === DOOR
            && (doorMask(source) & (D_CLOSED | D_LOCKED)));
    if (!sourceAccessible) {
        throw new UnsupportedHeroMoveBoundaryError(
            'exceptional pet displacement terrain',
        );
    }
    if (t_at(x, y, state)
        || t_at(state.u.ux, state.u.uy, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap trap interaction',
        );
    }
    if (state.level?.objects?.[x]?.[y]) {
        throw new UnsupportedHeroMoveBoundaryError(
            'combined pet and floor object interaction',
        );
    }
    if (state.level?.regions?.length) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap region crossing',
        );
    }
    if (engr_at(x, y, state)
        || engr_at(state.u.ux, state.u.uy, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap engraving interaction',
        );
    }
}

// cmd.c establishes movement intent only after this hack.c admission seam has
// shown that the destination is inside the currently ported domove() subset.
export function preflightDomoveDestination(x, y, state = game, run = 0) {
    // The destination monster comes first, because domove_core() does: it
    // takes m_at() at hack.c:2762, runs its run-stop, then domove_bump_mon()
    // and domove_attackmon_at() at 2786-2796, and only reaches test_move() at
    // 2841. Admitting a diagonal doorway step ahead of that inverted the order
    // and turned an honest 'hero combat or displacement' stop into a silent
    // one: the port refused the step in test_move() and never attacked, where
    // C attacks -- uhitm.c do_attack() has no diagonal-doorway test at all.
    const destinationMonster = m_at(x, y, state);
    if (destinationMonster) {
        // domove_core()'s run arm stops in front of a monster the hero can
        // make out, without attacking it and without spending the move. That
        // arm is ported, so admit the command and let domove() run it; the
        // pet-displacement seam below owns every other destination monster.
        if (runStopsBeforeMonster(destinationMonster, run, state)) return;
        // A refused diagonal with any monster on the destination fails closed,
        // safemon included, and it does so before the swap-consequence gates
        // below.
        //
        // C reaches do_attack() first: uhitm.c:474 evaluates
        // `foo = (Punished || !rn2(7) || ...)` inside its is_safemon branch, so
        // even the pet case spends a draw before do_attack() returns FALSE and
        // test_move() refuses. do_attack() IS ported -- js/uhitm.js:51, with
        // that draw at :70 -- and domove() calls it live at :1098. The blocker
        // is ordering, not coverage: domove() runs test_move() at :1065 before
        // that call, the reverse of hack.c:2794 and :2841, so admitting the
        // step would refuse it inside test_move() and never reach the draw.
        // Remove this throw when domove() is reordered to match, not when
        // "combat lands" -- it already has.
        //
        // Refusing ahead of requireOrdinaryStartingPetSwap() also keeps its
        // trap, object, region and engraving gates out of a step C never lets
        // reach them.
        if (refusedDiagonalDoorway(x, y, state)) {
            throw new UnsupportedHeroMoveBoundaryError(
                'hero combat or displacement',
            );
        }
        requireOrdinaryStartingPetSwap(destinationMonster, x, y, state);
    } else if (refusedDiagonalDoorway(x, y, state)) {
        // test_move() owns both diagonal doorway refusals on an empty square.
    } else if (closed_door(x, y, state)) {
        // test_move()'s closed-door arm (1074) runs before its testdiag
        // label (1134-1135), so a diagonal walk into a closed door reaches
        // the autoopen route rather than the diagonal doorway rules. The
        // diagonal case is not silent by accident either: hack.c:1112 gates
        // the bump and its sibling on `x == ux || y == uy`, so a diagonal
        // step whose autoopen test fails prints nothing and falls through.
        requireAutoopenClosedDoor(x, y, state, run);
    } else if (!blocksMove(x, y, state)) {
        requireSimpleHeroDestination(x, y, state);
    }
}

// This seam owns the four hero states hack.c:1014-1045 answers for before its
// closing else, the arm this port covers. A STONE or wall destination reaches
// test_move() unexamined -- preflightDomoveDestination() has no arm for it --
// so unlike requireAutoopenClosedDoor() this one has a single caller, the
// obstacle arm itself. It runs after that arm's terrain refusal, because for
// the two types left by then, STONE and IS_WALL, C's chain asks these four
// questions in this order and nothing else stands between them.
//
// Every refusal here is unconditional in `mode`, which the tight-diagonal
// switch below deliberately is not: `3f9be36` gated that switch because
// landing_spot() probes eight neighbours with TEST_MOVE and one loud refusal
// ended the dismount. The same gating is available to two of these four and
// not to the other two. C's Underwater and autodig arms return FALSE in every
// mode and print or dig only under DO_MOVE, so a probe could be answered
// FALSE; its Passes_walls and tunnels arms fall through the chain and can
// answer TRUE, so a probe answered FALSE would diverge. None of the four
// states is reachable in this port, so nothing probes them and the plain
// refusal costs nothing; whoever makes one reachable reads this first.
function requireOrdinaryObstacleRefusal(state) {
    const data = state.youmonst?.data;
    // hack.c:1014 `Passes_walls && may_passwall(x, y)` falls through the whole
    // arm and can answer TRUE, hack.c:1016 Underwater prints "There is an
    // obstacle there." instead of the wall line, and hack.c:1037 a tunneller
    // that needs no pick eats the rock through still_chewing(), which changes
    // the map and draws. The refusal is wider than C for the first: it does
    // not ask may_passwall(), so a Sokoban or nondiggable wall stops here too
    // rather than reaching the "Sokoban walls resist your ability." line that
    // shares this arm's closing else. Nothing in this port grants either
    // property, so the width costs no reachable behavior.
    if (propertyPresent(state, PASSES_WALLS)
        || state.u?.uinwater
        || (tunnels(data) && !needspick(data))) {
        throw new UnsupportedHeroMoveBoundaryError(
            'obstacle passed rather than blocking',
        );
    }
    // hack.c:1042. use_pick_axe2() changes the map and draws, so the arm has
    // to stop even though `flags.autodig` has no writer yet: js/options.js
    // carries the name in its catalog and nothing reads it back into
    // state.flags. svc.context.nopick has no writer either, which is why the
    // read is `state.context?.nopick` rather than a ported field.
    if (state.flags?.autodig && !state.context?.run && !state.context?.nopick
        && state.uwep && is_pick(state.uwep, state)) {
        throw new UnsupportedHeroMoveBoundaryError('automatic digging');
    }
}

// Each pline() test_move() reaches is injected rather than imported, so a test
// can read the line without a terminal. Resolving through one helper turns a
// missing or misspelled operation into a failure instead of a silent no-op.
function requiredMessageOperation(env, arm) {
    const message = env.message;
    if (typeof message !== 'function')
        throw new TypeError(`${arm} requires a message operation`);
    return message;
}

// C ref: hack.c test_move(). Five of its branches are ported: the
// physical-obstacle refusal for ordinary wall and rock, which consumes no time
// or randomness, the IS_DOOR/closed_door() arm's autoopen route into lock.c
// doopen_indir(), the bump arm that a suppressed autoopen falls into, and its
// two diagonal doorway rules, which also spend no time. Its remaining terrain
// branches remain at the command admission boundary, which refuses every
// destination type this function does not own before domove() is reached.
//
// The ability branches are different, and the difference is easy to miss.
// preflightDomoveDestination()'s else-if chain has no arm at all for a STONE
// or wall destination -- blocksMove() answers TRUE there, so the chain falls
// off its end without a throw -- so the hero states hack.c:1014-1045 branches
// on inside the obstacle arm have no owner at the seam. They are refused here
// instead, by requireOrdinaryObstacleRefusal(), the way
// requireAutoopenClosedDoor() refuses the closed-door arm's equivalents.
//
// `mode` is C's fourth argument. Two of its four values have a ported caller:
// domove_core() asks DO_MOVE, which is the only value that prints, opens a
// door or spends a move, and steed.c mount_steed() asks TEST_MOVE, which only
// wants the boolean. TEST_TRAV and TEST_TRAP belong to findtravelpath(), which
// is unported; the two places C treats them differently from TEST_MOVE, the
// closed-door `goto testdiag` and the `svc.context.run == 8` filter, therefore
// have no caller that can reach them and are marked where they would sit.
export async function test_move(
    ux,
    uy,
    dx,
    dy,
    mode,
    state = game,
    env = {},
) {
    state.context ??= {};
    state.context.door_opened = false;
    const x = ux + dx;
    const y = uy + dy;
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);

    // C ref: hack.c:1011. The obstacle arm claims the square before either
    // diagonal doorway rule below can look at it, so the types it owns that
    // this port does not are refused here rather than falling through to them.
    // They keep the reason requireSimpleHeroDestination() gives them, which is
    // the only other place that can refuse a TREE, SDOOR, SCORR or IRONBARS
    // destination.
    if (IS_OBSTRUCTED(location.typ) || location.typ === IRONBARS) {
        if (location.typ !== STONE && !IS_WALL(location.typ)) {
            throw new UnsupportedHeroMoveBoundaryError(
                'door or special terrain movement',
            );
        }
        // C runs feel_location() before its branch chain, so refusing here
        // skips a tactile update C performs. The terrain refusal above sits on
        // the same side for the same reason: a refusal ends the port's run, and
        // a half-updated map would only make the stop harder to read.
        requireOrdinaryObstacleRefusal(state);
        if (heroIsBlind(state) && mode === DO_MOVE) feel_location(x, y, state);

        if (mode === DO_MOVE && state.flags?.mention_walls) {
            const symbol = location.typ === STONE
                ? S_stone : wall_angle(location);
            const description = symbol === S_stone ? 'solid stone' : 'a wall';
            const message = requiredMessageOperation(env, 'wall refusal');
            await message(
                messageAt(`It's ${description}.`, x, y, state),
                state,
            );
        }
        return false;
    }

    if (IS_DOOR(location.typ) && closed_door(x, y, state)) {
        // hack.c:1093-1136. Everything below the `if (mode == DO_MOVE)` there
        // is skipped for the other three modes, which answer FALSE without
        // opening the door, printing, or spending a move. TEST_TRAV and
        // TEST_TRAP take `goto testdiag` first; neither has a ported caller.
        if (mode !== DO_MOVE) return false;
        const run = state.context.run ?? 0;
        requireAutoopenClosedDoor(x, y, state, run);
        if (!autoopenSuppressed(state, run)) {
            // doopen_indir() accepts only `message` and `random` from this env
            // and rejects any other key, so test_move()'s wider injection
            // contract narrows here rather than being forwarded whole.
            await doopen_indir(x, y, state, env);
            // hack.c:1110-1111. door_opened suppresses domove_core()'s
            // `move = 0; nomul(0)` when the pull succeeded; move itself is
            // FALSE either way, because domove_core()'s only DO_MOVE call
            // passes the hero's own square as <ux,uy>.
            state.context.door_opened = !closed_door(x, y, state);
            state.context.move
                = (ux !== state.u.ux || uy !== state.u.uy) ? 1 : 0;
        } else if (x === ux || y === uy) {
            // hack.c:1099-1128, the arm a suppressed autoopen falls into. It
            // is orthogonal-only: a diagonal step at a closed door prints
            // nothing and just returns FALSE.
            //
            // C gates the bump on `Blind || Stunned || ACURR(A_DEX) < 10
            // || Fumbling`. Three of those four stop at the seam above, so
            // Dexterity is the whole live test; the C order still puts it
            // third. Neither line goes through set_msg_xy(), and pline.c
            // vpline() clears a11y.msg_loc after every message, so neither
            // carries a direction prefix under `accessiblemsg`.
            const message = requiredMessageOperation(env, 'closed door');
            if (effective_attribute(state, A_DEX) < 10) {
                await message('Ouch!  You bump into a door.', state);
                await exercise(A_DEX, false, state, env.random ?? { rn2 });
                // hack.c:1122-1127, the inverse of the pull's bookkeeping.
                // C has just claimed a move it did not make, so the caller's
                // `move = 0; nomul(0)` has to be suppressed by door_opened
                // and the run stopped here by hand instead. The turn really
                // does elapse: this is the one closed-door outcome that costs
                // the hero time.
                //
                // door_opened is what does that work. The `move` half of C's
                // combined assignment cannot be observed at this call site,
                // because domove_core() is test_move()'s only DO_MOVE caller
                // and rhack() has already set svc.context.move for the step;
                // it is kept because it is half of one C statement, and no
                // test can pin it.
                state.context.door_opened = true;
                state.context.move = 1;
                nomul(0, state);
            } else {
                await message('That door is closed.', state);
            }
        }
        return false;
    }

    if (IS_DOOR(location.typ)
        && blocksDiagonalDoorwayEntry(ux, uy, x, y, state)) {
        // C ref: hack.c:1139-1150, the testdiag arm, which the closed-door arm
        // above returns before. Underwater joins mention_walls on this line
        // and not on the exit rule's below. Neither message goes through
        // set_msg_xy(), so neither carries a direction prefix under
        // `accessiblemsg`.
        if (mode === DO_MOVE && heroIsBlind(state)) feel_location(x, y, state);
        if (mode === DO_MOVE
            && (state.u.uinwater || state.flags?.mention_walls)) {
            const message = requiredMessageOperation(env, 'doorway entry');
            await message(
                "You can't move diagonally into an intact doorway.",
                state,
            );
        }
        return false;
    }

    // C ref: hack.c:1153-1177. Every refusal the tight-diagonal switch can
    // print is dormant at this boundary and stays deferred: case 1 needs a
    // bigmonst polyform, case 3 needs Sokoban, and case 2 needs an inventory
    // heavier than WT_TOOMUCH_DIAGONAL, which no ported pickup path can build.
    // The live outcome is the fall-through, which is what lets the hero walk a
    // diagonal in a corridor, so cant_squeeze_thru() is called rather than
    // assumed: without it a hero who did cross the weight threshold would
    // squeeze through in silence where C stops him.
    const species = state.youmonst?.data;
    if (dx && dy && bad_rock(species, ux, y, state)
        && bad_rock(species, x, uy, state)) {
        if (cant_squeeze_thru(state.youmonst, state)) {
            // Each of C's three cases wraps its line in `if (mode == DO_MOVE)`
            // and then returns FALSE for every mode, so a TEST_MOVE or
            // TEST_TRAV probe drops the candidate square in silence. Only
            // DO_MOVE owes the message this port has not ported, and
            // landing_spot() probes all eight neighbours of a hero who may be
            // standing in a corridor, where both corner squares are STONE and
            // this switch is entered every time.
            if (mode !== DO_MOVE) return false;
            throw new UnsupportedHeroMoveBoundaryError('tight diagonal move');
        }
    } else if (dx && dy && m_at(ux, y, state)
        && m_at(ux, y, state) === m_at(x, uy, state)) {
        // C ref: hack.c:1172-1176 and worm.c worm_cross(), whose first two
        // tests are these. One monster on both corner squares can only be a
        // long worm; the consecutive-segment test that decides the refusal
        // reads wtails[], which has no ported counterpart, and neither does
        // the YMonnam() in the message.
        //
        // This arm therefore refuses in every mode, unlike the switch above.
        // Returning FALSE for a TEST_MOVE probe would be a guess: when the two
        // segments are not consecutive C's worm_cross() answers FALSE and
        // test_move() carries on to return TRUE, and this port cannot tell the
        // two apart.
        throw new UnsupportedHeroMoveBoundaryError('long worm body crossing');
    }

    // C ref: hack.c:1181-1205. The run == 8 travel filter and the TEST_TRAP
    // return above `ust` have no ported caller: findtravelpath() is what sets
    // run to 8, and it passes TEST_TRAV or TEST_TRAP, neither of which any
    // ported caller asks for.
    if (blocksDiagonalDoorwayExit(ux, uy, x, y, state)) {
        // C ref: hack.c:1208-1214. No feel_location() here, and mention_walls
        // is the whole gate.
        if (mode === DO_MOVE && state.flags?.mention_walls) {
            const message = requiredMessageOperation(env, 'doorway exit');
            await message(
                "You can't move diagonally out of an intact doorway.",
                state,
            );
        }
        return false;
    }
    return true;
}

// C ref: hack.c move_out_of_bounds(). domove_core() calls this ahead of every
// terrain branch, so a step off the edge of the map ends the run and spends no
// time before test_move() runs. Its forcefight arm needs domove_fight_empty()
// and its flags.mention_walls line needs directionname(xytodir()); neither is
// ported, so both refuse. Until this was ported the refusal happened by
// accident, through an admission seam that answered "blocked" for a square
// outside the map.
function move_out_of_bounds(x, y, state) {
    if (isok(x, y)) return false;
    if (state.context.forcefight || state.flags?.mention_walls) {
        throw new UnsupportedHeroMoveBoundaryError('move out of bounds');
    }
    nomul(0, state);
    state.context.move = 0;
    return true;
}

// C ref: hack.c Known_wwalking. Water walking boots are the only source, and
// the hero has to have identified them.
function known_wwalking(state) {
    const boots = state.uarmf;
    return Boolean(boots
        && boots.otyp === WATER_WALKING_BOOTS
        && objectType(boots, state).oc_name_known
        && !state.u.usteed);
}

// C ref: hack.c Known_lwalking.
function known_lwalking(state) {
    return known_wwalking(state)
        && (propertyIntrinsic(state, FIRE_RES)
            || Boolean(state.u?.uprops?.[FIRE_RES]?.extrinsic))
        && Boolean(state.uarmf.oerodeproof)
        && Boolean(state.uarmf.rknown);
}

// C ref: hack.c avoid_moving_on_trap(). Its message needs trapname() and an(),
// neither of which is ported, so a msg = TRUE caller stops instead.
//
// Two callers pass TRUE. lookaround()'s trap arm does, at run values above 1,
// which the ctrl-direction rush now reaches. The other is
// avoid_running_into_trap_or_liquid(), which is `domove_core()`'s first run arm
// and is not ported at all: at run 1 it can only act on a destination trap or
// liquid, and both are refused before domove() reaches them, so nothing is
// dropped today. Port it with the trap work, where C stops a rush cleanly with
// no time spent and the port's destination seam throws instead.
function avoid_moving_on_trap(x, y, msg, state) {
    const trap = t_at(x, y, state);
    if (trap && trap.tseen && trap.ttyp !== VIBRATING_SQUARE) {
        if (msg && state.flags?.mention_walls) {
            throw new UnsupportedHeroMoveBoundaryError(
                'a trap stop message while rushing',
            );
        }
        return true;
    }
    return false;
}

// C ref: hack.c avoid_moving_on_liquid(). The clinging-polyform case the
// source marks XXX is absent there too.
async function avoid_moving_on_liquid(x, y, msg, state) {
    const inAir = propertyActiveUnblocked(state, LEVITATION)
        || heroIsFlying(state);
    const destination = state.level?.at(x, y);
    const here = state.level?.at(state.u.ux, state.u.uy);
    const pool = is_pool(x, y, state);
    if ((destination?.typ === here?.typ
        || ((state.context.run ?? 0) < 2 && (!is_lava(x, y, state) || inAir))
        || state.context.travel)
        && (inAir || known_lwalking(state) || (pool && known_wwalking(state)))
        && !(IS_WATERWALL(destination.typ)
            || destination.typ === LAVAWALL)) {
        return false; /* liquid is safe to traverse */
    }
    if ((pool || is_lava(x, y, state)) && destination?.seenv) {
        if (msg && state.flags?.mention_walls) {
            await ttyPline(
                messageAt(
                    `You stop at the edge of the ${hliquid(
                        pool ? 'water' : 'lava',
                        { state },
                    )}.`,
                    x,
                    y,
                    state,
                ),
                state,
            );
        }
        return true;
    }
    return false;
}

// C ref: hack.c domove_core()'s "Don't attack if you're running" arm. The
// hero stops without spending the move; the destination monster is left
// alone.
// C ref: hack.c domove_core()'s don't-attack-while-running condition at 2764,
// `svc.context.run && ((!Blind && mon_visible(mtmp) && (...)) || sensemon(mtmp))`.
// Exported so each of its three terms can be pinned on its own: the live path
// reaches it only through domove(), where a hostile in front is also being
// attacked, which hides which term decided the stop.
export function runStopsBeforeMonster(monster, run, state) {
    if (!run || !monster || is_safemon(monster, state))
        return false;
    const appearance = (monster.m_ap_type ?? 0) & M_AP_TYPMASK;
    const seen = !heroIsBlind(state)
        && monsterVisible(monster, state)
        && ((appearance !== M_AP_FURNITURE && appearance !== M_AP_OBJECT)
            || propertyActiveUnblocked(state, PROT_FROM_SHAPE_CHANGERS));
    return seen || sensesMonster(monster, state);
}

// C ref: hack.c domove(). This remains the narrow ordinary-floor subset; the
// movement milestone will replace its collision and terrain branches in source
// order without changing the command intent established by cmd.c. It requires
// established u.dx/u.dy and context.move = 1. Success updates the position and
// leaves that turn flag untouched; a blocked step sets it to 0 and cancels
// multi, context.mv, and context.run. moveloop_core() calls this directly only
// for already-established movement intent. Like hack.c, a changed hero
// position sets u.umoved for the subsequent turn effects.
export async function domove(state = game) {
    const u = state.u;
    const newx = u.ux + u.dx;
    const newy = u.uy + u.dy;

    // C ref: hack.c domove_core():2815-2818, 2874-2884, 2924-2926 and 2934.
    // A mounted hero's step carries the steed: stucksteed() can refuse the
    // move outright, the steed's <mx,my> follow the hero on the way out and
    // on the way back from a failed pet swap, exercise_steed() trains the
    // riding skill, and u_on_newpos() repositions both. None of that is
    // ported, so a ride ends where the hero next tries to move rather than
    // walking the steed's coordinates into a stale position in silence.
    if (u.usteed) {
        throw new UnsupportedHeroMoveBoundaryError('movement while riding');
    }

    if (move_out_of_bounds(newx, newy, state)) {
        state.domoveAttempting = 0;
        return;
    }
    // C ref: domove_core():2843-2849. The closed-door arm inside test_move()
    // sets context.door_opened when the pull succeeded, and that suppresses
    // the no-time refusal here even though the hero has not moved.
    if (!await test_move(u.ux, u.uy, u.dx, u.dy, DO_MOVE, state, {
        message: ttyPline,
    })) {
        if (!state.context.door_opened) {
            state.context.move = 0;
            nomul(0, state);
        }
        state.domoveAttempting = 0;
        return;
    }
    const destinationMonster = m_at(newx, newy, state);
    if (runStopsBeforeMonster(destinationMonster, state.context.run, state)) {
        nomul(0, state);
        state.context.move = 0;
        state.domoveAttempting = 0;
        return;
    }
    if (destinationMonster) {
        requireOrdinaryStartingPetSwap(
            destinationMonster,
            newx,
            newy,
            state,
        );
    } else {
        requireSimpleHeroDestination(newx, newy, state);
    }

    const oldx = u.ux;
    const oldy = u.uy;
    u.ux0 = oldx;
    u.uy0 = oldy;
    if (destinationMonster) {
        const attackConsumedMove = await do_attack(
            destinationMonster,
            state,
            {
                endRunning,
                message: ttyPline,
                unsupported: (reason) => {
                    throw new UnsupportedHeroMoveBoundaryError(reason);
                },
            },
        );
        if (attackConsumedMove) {
            state.domoveAttempting = 0;
            return;
        }
    }
    if (!await in_out_region(newx, newy, { state })) return;
    u.ux = newx;
    u.uy = newy;
    if (destinationMonster) {
        await domove_swap_with_pet(
            destinationMonster,
            newx,
            newy,
            state,
            { message: ttyPline },
        );
    }

    // C ref: domove_core():2934. The writes above are C's tentative move; this
    // is its full re-position, possibly back to where the hero started when a
    // pet swap failed. On a same-level step its whole effect is
    // see_nearby_objects(), which turns a nearby generic potion or gem from
    // its class colour into its own.
    u_on_newpos(u.ux, u.uy, state);

    // C ref: domove_core()'s run arm after u_on_newpos(). A run that walks
    // onto a doorway or a furniture square such as a staircase ends there.
    // reset_occupations() precedes it in C and has no ported occupation to
    // reset. The run < 8 test excludes travel only.
    const destination = state.level?.at(newx, newy);
    if (state.context.run && state.context.run < 8
        && (IS_DOOR(destination.typ)
            || IS_OBSTRUCTED(destination.typ)
            || IS_FURNITURE(destination.typ))) {
        nomul(0, state);
    }

    u.umoved = true;

    if (hero_tread_disturbs_buried_zombies(state))
        disturb_buried_zombies(newx, newy, state);

    newsym(oldx, oldy);
    vision_recalc(1);
    newsym(newx, newy);
    // C ref: domove_core():2980 spoteffects(TRUE).
    await spoteffects(true, state);
    await runmode_delay_output(state);
    maybe_smudge_engr(oldx, oldy, newx, newy, state);
    state.domoveAttempting = 0;
}

// C ref: hack.c nh_delay_output()'s window-port entry. Recorder patch 006
// makes the patched tty capture one animation frame and return immediately
// whenever NETHACK_NO_DELAY is set, which is how every recording runs, so the
// frame capture is the whole of its observable behavior.
async function nh_delay_output(state) {
    await state._animationFrameHook?.();
}

// C ref: display.c curs_on_u(). flush_screen() reads the module-global `game`,
// here and at every other call site in the port, so a caller threading some
// other state would write disp.time_botl into one object and have it read and
// cleared from another. The production path only ever runs on `game`; this
// refuses anything else rather than flushing the wrong game silently.
async function curs_on_u(state) {
    if (state !== game) {
        throw new TypeError('curs_on_u() flushes the global game state');
    }
    await flush_screen(1);
}

// C ref: hack.c runmode_delay_output(). Called once per turn from
// moveloop_core() while a multi-turn action is running and once more at the
// end of each domove().
export async function runmode_delay_output(state = game) {
    if ((state.context.run || state.multi)
        && state.flags.runmode !== RUN_TPORT) {
        // For normal (leap) mode, update the display every 7th step relative
        // to the turn counter; walk and crawl update after every step.
        if (state.flags.runmode !== RUN_LEAP || !(state.moves % 7)) {
            state.disp ??= {};
            // moveloop_core() suppresses time_botl while running.
            state.disp.time_botl = Boolean(state.flags.time);
            await curs_on_u(state);
            await nh_delay_output(state);
            if (state.flags.runmode === RUN_CRAWL) {
                await nh_delay_output(state);
                await nh_delay_output(state);
                await nh_delay_output(state);
                await nh_delay_output(state);
            }
        }
    }
}

// C ref: hack.h NODIAG(). Only grid bugs are barred from diagonal movement.
export function NODIAG(monnum) {
    return monnum === PM_GRID_BUG;
}

// C ref: monst.h is_door_mappear().
function is_door_mappear(monster) {
    return ((monster.m_ap_type ?? 0) & M_AP_TYPMASK) === M_AP_FURNITURE
        && (monster.mappearance === S_hcdoor
            || monster.mappearance === S_vcdoor);
}

const LOOKAROUND_CONTINUE = 0;
const LOOKAROUND_STOP = 1;

// C ref: hack.c lookaround(). Stop running if something interesting is next
// to the hero; turn around a corner if that is the only way to proceed; never
// turn left or right twice. The two labels the source jumps to become the
// bcorr() closure and the LOOKAROUND_STOP result of examine().
export async function lookaround(state = game) {
    const u = state.u;
    let i = 0;
    let x0 = 0;
    let y0 = 0;
    let m0 = 1;
    let i0 = 9;
    let corrct = 0;
    let noturn = 0;

    // Grid bugs stop if trying to move diagonal, even if blind. Maybe they
    // polymorphed while in the middle of a long move.
    if (NODIAG(u.umonnum) && u.dx && u.dy) {
        await ttyPline('You cannot move diagonally.', state);
        nomul(0, state);
        return;
    }

    if (heroIsBlind(state) || state.context.run === 0) return;

    const here = state.level.at(u.ux, u.uy);

    // C ref: lookaround()'s bcorr label. Its body counts corridor squares
    // around the hero and picks the one a corner turn would follow. A hero
    // standing in a room skips the count entirely, which is why a run that
    // starts and ends inside one room can neither widen-stop nor turn a
    // corner.
    const bcorr = (x, y, mtmp) => {
        if (here.typ !== ROOM) {
            const run = state.context.run;
            /* running or traveling */
            if (run === 1 || run === 3 || run === 8) {
                /* distance from x,y to the location we're moving to */
                i = dist2(x, y, u.ux + u.dx, u.uy + u.dy);
                /* ignore if not on or directly adjacent to it */
                if (i > 2) return LOOKAROUND_CONTINUE;
                /* x,y is (adjacent to) the location we're moving to; if we've
                   seen one corridor, and x,y is not directly orthogonally
                   next to it, mark noturn */
                if (corrct === 1 && dist2(x, y, x0, y0) !== 1) noturn = 1;
                /* if previous x,y was diagonal, now x,y is orthogonal (or
                   this is the first time we're here) */
                if (i < i0) {
                    i0 = i;
                    x0 = x;
                    y0 = y;
                    m0 = mtmp ? 1 : 0;
                }
            }
            corrct++;
        }
        return LOOKAROUND_CONTINUE;
    };

    const examine = async (x, y) => {
        const infront = (x === u.ux + u.dx && y === u.uy + u.dy);

        /* ignore out of bounds, and our own location */
        if (!isok(x, y) || (x === u.ux && y === u.uy))
            return LOOKAROUND_CONTINUE;
        /* (grid bugs) ignore diagonals */
        if (NODIAG(u.umonnum) && x !== u.ux && y !== u.uy)
            return LOOKAROUND_CONTINUE;

        const mtmp = m_at(x, y, state);
        const location = state.level.at(x, y);

        /* can we see a monster there? */
        if (mtmp) {
            const appearance = (mtmp.m_ap_type ?? 0) & M_AP_TYPMASK;
            if (appearance !== M_AP_FURNITURE
                && appearance !== M_AP_OBJECT
                && monsterVisible(mtmp, state)) {
                /* running movement and not a hostile monster, OR it blocks
                   our move direction and we're not traveling */
                if ((state.context.run !== 1 && !is_safemon(mtmp, state))
                    || (infront && !state.context.travel)) {
                    if (state.flags?.mention_walls) {
                        // "%s blocks your path." needs a_monnam(), which has
                        // no ported owner.
                        throw new UnsupportedHeroMoveBoundaryError(
                            'a blocked-path message',
                        );
                    }
                    return LOOKAROUND_STOP;
                }
            }
        }

        /* stone is never interesting */
        if (location.typ === STONE) return LOOKAROUND_CONTINUE;
        /* ignore the square we're moving away from */
        if (x === u.ux - u.dx && y === u.uy - u.dy)
            return LOOKAROUND_CONTINUE;

        /* stop for traps, sometimes */
        if (avoid_moving_on_trap(
            x, y, infront && state.context.run > 1, state,
        )) {
            if (state.context.run === 1) return bcorr(x, y, mtmp);
            if (infront) return LOOKAROUND_STOP;
        }

        /* more uninteresting terrain */
        if (IS_OBSTRUCTED(location.typ) || location.typ === ROOM
            || IS_AIR(location.typ) || location.typ === ICE) {
            return LOOKAROUND_CONTINUE;
        } else if (closed_door(x, y, state)
            || (mtmp && is_door_mappear(mtmp))) {
            /* a closed door? ignore if diagonal */
            if (x !== u.ux && y !== u.uy) return LOOKAROUND_CONTINUE;
            if (state.context.run !== 1 && !state.context.travel) {
                if (state.flags?.mention_walls) {
                    await ttyPline(
                        messageAt(
                            'You stop in front of the door.', x, y, state,
                        ),
                        state,
                    );
                }
                return LOOKAROUND_STOP;
            }
            /* orthogonal to a closed door, consider it a corridor */
            return bcorr(x, y, mtmp);
        } else if (location.typ === CORR) {
            return bcorr(x, y, mtmp);
        } else if (is_pool(x, y, state) || is_lava(x, y, state)) {
            if (infront && await avoid_moving_on_liquid(x, y, true, state))
                return LOOKAROUND_STOP;
            return LOOKAROUND_CONTINUE;
        }
        /* e.g. objects or trap or stairs */
        if (state.context.run === 1) return bcorr(x, y, mtmp);
        if (state.context.run === 8) return LOOKAROUND_CONTINUE;
        if (mtmp) return LOOKAROUND_CONTINUE; /* d */
        if (((x === u.ux - u.dx) && (y !== u.uy + u.dy))
            || ((y === u.uy - u.dy) && (x !== u.ux + u.dx)))
            return LOOKAROUND_CONTINUE;
        return LOOKAROUND_STOP;
    };

    for (let x = u.ux - 1; x <= u.ux + 1; ++x) {
        for (let y = u.uy - 1; y <= u.uy + 1; ++y) {
            if (await examine(x, y) === LOOKAROUND_STOP) {
                nomul(0, state);
                return;
            }
        }
    }

    if (corrct > 1 && state.context.run === 2) {
        if (state.flags?.mention_walls)
            await ttyPline('The corridor widens here.', state);
        nomul(0, state);
        return;
    }
    if ((state.context.run === 1 || state.context.run === 3
        || state.context.run === 8)
        && !noturn && !m0 && i0
        && (corrct === 1 || (corrct === 2 && i0 === 1))) {
        /* make sure that we do not turn too far */
        if (i0 === 2) {
            if (u.dx === y0 - u.uy && u.dy === u.ux - x0)
                i = 2; /* straight turn right */
            else
                i = -2; /* straight turn left */
        } else if (u.dx && u.dy) {
            if ((u.dx === u.dy && y0 === u.uy)
                || (u.dx !== u.dy && y0 !== u.uy))
                i = -1; /* half turn left */
            else
                i = 1; /* half turn right */
        } else {
            if ((x0 - u.ux === y0 - u.uy && !u.dy)
                || (x0 - u.ux !== y0 - u.uy && u.dy))
                i = 1; /* half turn right */
            else
                i = -1; /* half turn left */
        }

        i += u.last_str_turn;
        if (i <= 2 && i >= -2) {
            u.last_str_turn = i;
            u.dx = x0 - u.ux;
            u.dy = y0 - u.uy;
        }
    }
}

// C ref: hack.c domove_swap_with_pet(), successful ordinary starting-pet
// branch. domove() reaches this helper only after its admission seam has
// accepted ordinary terrain, an object-free destination, no source or
// destination trap, an accessible source square, and ordinary pet state.
export async function domove_swap_with_pet(
    monster,
    x,
    y,
    state = game,
    env = {},
) {
    const message = env.message;
    if (typeof message !== 'function')
        throw new TypeError('pet swap requires a message operation');
    const { u } = state;
    const oldX = u.ux0;
    const oldY = u.uy0;

    monster.mundetected = false;
    monster.mtrapped = false;
    remove_monster(x, y, state);
    place_monster(monster, oldX, oldY, state);
    newsym(x, y);
    newsym(oldX, oldY);
    await message(
        `You swap places with ${alwaysVisibleMonsterName(monster, state)}.`,
        state,
    );
    return true;
}

// C ref: youprop.h Flying, which counts a flying steed as carrying the hero.
function heroIsFlying(state) {
    const flyingProperty = state.u?.uprops?.[FLYING] ?? {};
    return Boolean(
        (flyingProperty.intrinsic
            || flyingProperty.extrinsic
            || (state.u?.usteed && is_flyer(state.u.usteed.data)))
        && !flyingProperty.blocked,
    );
}

// C ref: hack.c domove(), the heavy-tread branch immediately after the hero
// position update.
export function hero_tread_disturbs_buried_zombies(state = game) {
    return !propertyActiveUnblocked(state, LEVITATION)
        && !heroIsFlying(state)
        && !propertyActiveUnblocked(state, STEALTH)
        && (state.youmonst?.data?.cwt ?? 0) >= (WT_ELF / 2);
}

// C ref: hack.c switch_terrain() (3178-3217). Terrain that blocks levitation
// blocks flight as well, and both of those arms refuse here. The first is out
// of reach because every ported caller admits its destination through
// requireSimpleHeroDestination() first, which lets no square satisfy
// `blocklev` through. The second refuses on any nonzero blocked mask, matching
// C's `else if (BLevitation)` and `else if (BFlying)`; the only writers of
// those two masks in this port are polyself.c float_vs_flight()'s I_SPECIAL
// assignments, which need a hero who already has Levitation or Flying, and
// nothing grants either yet. What is left reachable is the flags.terrainstatus
// tail.
export function switch_terrain(state = game) {
    const { u } = state;
    const lev = state.level?.at(u.ux, u.uy);
    const blocklev = Boolean(lev)
        && (IS_OBSTRUCTED(lev.typ) || closed_door(u.ux, u.uy, state)
            || IS_WATERWALL(lev.typ) || lev.typ === LAVAWALL);
    if (blocklev) {
        throw new UnsupportedHeroMoveBoundaryError(
            'switch_terrain() onto terrain that blocks levitation',
        );
    }
    if (state.u.uprops[LEVITATION].blocked
        || state.u.uprops[FLYING].blocked) {
        throw new UnsupportedHeroMoveBoundaryError(
            'switch_terrain() unblocking levitation or flight',
        );
    }
    // Neither Levitation nor Flying can have changed above, so the
    // disp.botl update at 3212-3213 cannot fire either.
    if (state.flags?.terrainstatus) classify_terrain(state);
}

// C ref: hack.c set_uinwater() (3220-3227), the single owner of u.uinwater.
// The switch_terrain() call fires only when the flag actually changes, so
// do.c goto_level()'s set_uinwater(0) for a hero who is not in water is inert.
// js/u_init.js stores u.uinwater as a boolean where C stores a one-bit field,
// so compare and assign booleans here rather than C's 0 and 1.
export function set_uinwater(in_out, state = game) {
    const value = Boolean(in_out);
    if (value !== Boolean(state.u.uinwater)) {
        state.u.uinwater = value;
        switch_terrain(state);
    }
}

// C ref: hack.c spoteffects():3345-3347, the terrain test that guards
// switch_terrain(). teleport.c teleds():551-552 has a test of its own with the
// same call, so this one is written where spoteffects() has it rather than
// folded into switch_terrain().
export function terrain_changed_under_hero(state = game) {
    const { u } = state;
    const current = state.level?.at(u.ux, u.uy);
    const previous = state.level?.at(u.ux0, u.uy0);
    if (!current || !previous) return false;
    return current.typ !== previous.typ
        || state.iflags?.terrain_typ === MAX_TYPE;
}

// C ref: hack.c spoteffects() (3312-3480), the arms an ordinary ROOM, CORR,
// STAIRS or open doorway square reaches. Its two ported callers, domove() and
// teleport.c teleds(), each admit their destination through
// requireSimpleHeroDestination() first, which refuses every square that could
// reach the pool, lava, sink, trap, ice-warning or resident-monster arms; the
// recursion guard and the iflags.in_lava_effects return are unreachable for
// the same reason.
//
// gi.in_steed_dismounting is C's kludge for the one caller that needs the
// pickup deferred: steed.c dismount_steed() sets it around its teleds() call
// and then lets float_down() run pickup(1) exactly once.
export async function spoteffects(pick, state = game) {
    if (terrain_changed_under_hero(state)) switch_terrain(state);
    check_special_room(false, state);
    if (!state.in_steed_dismounting) {
        // C ref: pickup(1) -> check_here(). pickup()'s own arms need
        // describe_decor(), read_engr_at() and autopickup, all of which
        // requireSimpleHeroDestination() refuses ahead of this call.
        if (pick) await check_here(false, state);
    }
}

// C ref: flag.h:233 notice_mon_off(). Suspends the accessibility monster
// notices while a caller emits messages of its own.
export function notice_mon_off(state = game) {
    state.a11y ??= {};
    state.a11y.mon_notices_blocked
        = (state.a11y.mon_notices_blocked ?? 0) + 1;
}

// C ref: flag.h:234-237 notice_mon_on(). C reports an unpaired resume through
// impossible() and clamps to zero; this throws instead, because a negative
// count means a caller lost its notice_mon_off() and would silently start
// noticing monsters again mid-message.
export function notice_mon_on(state = game) {
    state.a11y ??= {};
    const blocked = (state.a11y.mon_notices_blocked ?? 0) - 1;
    if (blocked < 0) throw new Error('mon_notices_blocked<0');
    state.a11y.mon_notices_blocked = blocked;
}

// C ref: hack.c notice_all_mons() (1744-1782). Announces every monster the
// hero can now spot, nearest first, after a notice_mon_off()/notice_mon_on()
// pair suspended the per-monster notices.
export async function notice_all_mons(reset, state = game, env = {}) {
    if (!reset) {
        // reset differs from TRUE only when nothing is spottable, where it
        // leaves each monster's mspotted alone instead of clearing it.
        // teleds() is the only ported caller and passes TRUE.
        throw new UnsupportedHeroMoveBoundaryError('notice_all_mons(FALSE)');
    }
    if (!state.a11y?.mon_notices || state.a11y?.mon_notices_blocked) return;
    const message = env.message ?? ttyPline;
    for (const line of collectMonsterNoticeMessages(state))
        await message(line, state);
}

// C ref: hack.c u_locomotion() (1817-1829). The hero's own movement verb.
// mondata.c locomotion() cannot answer it, because its is_flyer() and
// is_floater() tests read a monster form rather than the hero's properties.
export function u_locomotion(def, state = game) {
    if (propertyActiveUnblocked(state, LEVITATION))
        return def[0] === highc(def[0]) ? 'Float' : 'float';
    if (heroIsFlying(state))
        return def[0] === highc(def[0]) ? 'Fly' : 'fly';
    return locomotion(state.youmonst.data, def);
}

// C ref: hack.c invocation_message() (3064-3085). Its whole body sits behind
// invocation_pos(), which is Invocation_lev() and the level's fixed vibrating
// square. Invocation_lev() (dungeon.h:47) is In_hell() and the level above
// the bottom of Gehennom, and this port generates no level outside the
// Dungeons of Doom, so the clue message and u.uevent.uvibrated are dead. The
// guard is kept so that the first caller which does reach Gehennom stops here
// rather than skipping the clue in silence.
export function invocation_message(state = game) {
    if (state.u.uz.dnum !== 0) {
        throw new UnsupportedHeroMoveBoundaryError(
            'invocation_message() outside the Dungeons of Doom',
        );
    }
}

// C ref: hack.c maybe_smudge_engr(). Each eligible engraving consumes rnd(5)
// before wipe_engr_at() applies its type-specific erosion draws.
export function maybe_smudge_engr(
    x1,
    y1,
    x2,
    y2,
    state = game,
    random = { rn2, rnd },
) {
    if (!can_reach_floor(true, state)) return false;
    let smudged = false;
    const smudge = (x, y) => {
        const engraving = engr_at(x, y, state);
        if (!engraving || engraving.engr_type === HEADSTONE) return;
        wipe_engr_at(x, y, random.rnd(5), false, { state, random });
        smudged = true;
    };
    smudge(x1, y1);
    if (x2 !== x1 || y2 !== y1) smudge(x2, y2);
    return smudged;
}

// C ref: hack.c disturb_buried_zombies(). Nearby noise shortens only active
// zombification timers; other corpse timers and distant burials are untouched.
export function disturb_buried_zombies(x, y, state = game) {
    for (let obj = state.level?.buriedobjlist ?? null;
        obj;
        obj = obj.nobj) {
        if (obj.otyp !== CORPSE
            || !obj.timed
            || obj.ox < x - 1
            || obj.ox > x + 1
            || obj.oy < y - 1
            || obj.oy > y + 1
            || peek_timer(ZOMBIFY_MON, obj, state) <= 0) {
            continue;
        }
        const remaining = stop_timer(ZOMBIFY_MON, obj, state);
        start_timer(
            Math.max(1, Math.trunc(remaining * 2 / 3)),
            TIMER_OBJECT,
            ZOMBIFY_MON,
            obj,
            state,
        );
    }
}

// C refs: hack.c may_dig() and may_passwall().
export function may_dig(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    return !((IS_STWALL(location.typ) || IS_TREE(location.typ, state))
        && ((location.wall_info ?? 0) & W_NONDIGGABLE));
}

export function may_passwall(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    return !(IS_STWALL(location.typ)
        && ((location.wall_info ?? 0) & W_NONPASSWALL));
}

// C ref: hack.c bad_rock(), specialized only by its supplied monster species.
export function bad_rock(species, x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return true;
    return Boolean(
        (state.level?.flags?.sokoban_rules && sobj_at(BOULDER, x, y, state))
        || (IS_OBSTRUCTED(location.typ)
            && (!tunnels(species) || needspick(species)
                || !may_dig(x, y, state))
            && !(passes_walls(species) && may_passwall(x, y, state))),
    );
}

// C ref: hack.c cant_squeeze_thru(). The caller has already decided that the
// diagonal is tight; this reports why the mover cannot fit through it -- 1:
// too big, 2: possessions too heavy, 3: Sokoban -- or 0 when it can squeeze.
//
// C's `mon == &gy.youmonst` tests are what separate its two callers, so both
// live here rather than in two files. The hero reads the Passes_walls property
// and inv_weight() + weight_cap(), which is the plain inventory weight because
// inv_weight() returns that same total minus that same capacity; a monster
// reads its species and curr_mon_load(). Only the hero is stopped by Sokoban.
export function cant_squeeze_thru(mon, state = game) {
    const hero = mon === state.youmonst;
    const species = mon?.data;
    if (hero ? propertyPresent(state, PASSES_WALLS) : passes_walls(species))
        return 0;

    /* too big? */
    if (bigmonst(species)
        && !(amorphous(species) || is_whirly(species)
            || noncorporeal(species) || slithy(species)
            || can_fog(mon, state))) {
        return 1;
    }

    /* lugging too much junk? */
    // inv_weight() refreshes gw.wc as C's does; that write belongs wherever C
    // calls the function, which includes here.
    const amt = hero
        ? inv_weight(state) + weight_cap(state)
        : curr_mon_load(mon);
    if (amt > WT_TOOMUCH_DIAGONAL) return 2;

    /* Sokoban restriction applies to hero only */
    if (hero && state.level?.flags?.sokoban_rules) return 3;

    return 0;
}
