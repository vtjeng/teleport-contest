// Long-worm segment management and splitting.
// C ref: worm.c get_wormno(), initworm(), toss_wsegs(), shrink_worm(),
// wormgone(), cutworm(), place_wsegs(), remove_worm(),
// place_worm_tail_randomly(), count_wsegs(), create_worm_tail(), worm_known(),
// wseg_at().

import {
    has_mcorpsenm,
    MAX_NUM_WORMS,
    NON_PM,
} from './const.js';
import { game } from './gstate.js';
import { d, rn2, rnd } from './rng.js';
import { cansee } from './vision.js';
import { newsym } from './display.js';
import { m_at, remove_monster } from './monst.js';
import { PM_LONG_WORM } from './monsters.js';
import { clone_mon } from './makemon.js';
import { Monnam, mon_nam } from './do_name.js';
import { dist2, s_suffix } from './hacklib.js';

import { ttyPline } from './tty_message.js';
import { rnd_nextto_goodpos } from './trap.js';
import { note_unported } from './unported.js';
import { mattacku } from './mhitu.js';
import { canspotmon } from './display.js';

function wormSlots(state) {
    if (!state.level)
        throw new Error('worm lifecycle requires an initialized level');
    if (!Object.hasOwn(state.level, 'worms')) {
        state.level.worms = Array(MAX_NUM_WORMS).fill(null);
    }
    if (!Array.isArray(state.level.worms)
        || state.level.worms.length !== MAX_NUM_WORMS) {
        throw new Error('worm lifecycle found invalid level worm slots');
    }
    return state.level.worms;
}

function wormEnvironment(rawEnv = {}) {
    const supplied = rawEnv && typeof rawEnv === 'object' ? rawEnv : {};
    const state = supplied.state ?? game;
    // Keep the three source random operations bound to rng.js unless a caller
    // explicitly injects an override. Synthesizing rnd/d from rn2 changes the
    // recorder's call sites and can reorder their source attribution.
    const random = { rn2, rnd, d, ...(supplied.random ?? {}) };
    return { ...supplied, state, random };
}

function redrawWormSquare(x, y, env) {
    if (env.planning) return;
    if (typeof env.hooks?.newsym === 'function') {
        env.hooks.newsym(x, y, env);
    } else if (typeof env.newsym === 'function') {
        env.newsym(x, y, env.state);
    } else if (typeof env.redraw === 'function') {
        env.redraw(x, y, env.state);
    } else if (env.state === game) {
        newsym(x, y);
    }
}

async function wormMessage(line, env) {
    if (env.planning) return;
    const message = env.message ?? (env.state === game ? ttyPline : null);
    if (typeof message === 'function')
        await message(line, env.state, env);
}

// C ref: worm.c worm_known() (883-897). The segment array is the JS owner of
// wtails[worm->wormno]; a worm is known when any segment is in direct sight.
// Invisibility and telepathy are deliberately left to the caller, as in C.
export function worm_known(worm, state = game) {
    const segments = state.level?.worms?.[worm?.wormno]?.segments ?? [];
    return segments.some((segment) => cansee(
        segment.x,
        segment.y,
        state,
    ));
}

// C ref: worm.c wormhitu() (343-363). Tail nodes retain list order; the
// final node shares the head square and has already had its attack chance.
// C deliberately leaves the head in place while attacking through a tail.
export async function wormhitu(worm, rawEnv = {}) {
    const env = wormEnvironment(rawEnv);
    const segments = wormSlots(env.state)[worm.wormno].segments;
    for (let index = 0; index < segments.length - 1; ++index) {
        const segment = segments[index];
        if (dist2(segment.x, segment.y, env.state.u.ux, env.state.u.uy) < 3
            && await (env.attackHero ?? mattacku)(worm, env)) {
            return 1;
        }
    }
    return 0;
}

// C ref: worm.c count_wsegs(). The final array entry is the hidden segment
// co-located with the head, so only the preceding visible tail entries count.
export function count_wsegs(monster, state = game) {
    if (!monster?.wormno) return 0;
    const segments = state.level?.worms?.[monster.wormno]?.segments;
    return Math.max(0, (segments?.length ?? 0) - 1);
}

// C ref: worm.c get_wormno(). Slot zero remains reserved.
export function get_wormno(state = game) {
    for (let wormno = 1; wormno < MAX_NUM_WORMS; ++wormno) {
        if (!state.level?.worms?.[wormno]) return wormno;
    }
    return 0;
}

// C ref: worm.c create_worm_tail(). The returned list is tail-to-head and has
// one more node than num_segs: its last node tracks the hidden worm head.
export function create_worm_tail(num_segs) {
    if (num_segs === 0) return null;
    const segments = [{ x: 0, y: 0 }];
    for (let i = 0; i < num_segs; ++i)
        segments.push({ x: 0, y: 0 });
    return segments;
}

// C ref: worm.c wseg_at(). Return the remaining tail-to-head chain length
// only when the map index at (x,y) belongs to this worm.
export function wseg_at(worm, x, y, state = game) {
    if (!worm?.wormno || m_at(x, y, state) !== worm) return 0;
    const segments = state.level?.worms?.[worm.wormno]?.segments ?? [];
    const index = segments.findIndex(
        (segment) => segment.x === x && segment.y === y,
    );
    return index < 0 ? 0 : segments.length - index;
}

// C ref: worm.c initworm(). The array order is the source linked-list order,
// from the visible tail to the hidden segment co-located with the head.
export function initworm(monster, segmentCount, rawEnv = {}) {
    const { state } = wormEnvironment(rawEnv);
    const slots = wormSlots(state);
    if (!monster.wormno || slots[monster.wormno])
        throw new Error('initworm requires a newly allocated worm slot');
    const segments = create_worm_tail(segmentCount)
        ?? [{ x: 0, y: 0 }];
    const head = segments[segments.length - 1];
    head.x = monster.mx;
    head.y = monster.my;
    // worm.c also initializes wgrowtime[wnum] here; keep that level-local
    // clock with the segment chain so save/restore and planning clones carry
    // both values as one worm-slot record.
    slots[monster.wormno] = { segments, growtime: 0 };
}

// C ref: worm.c toss_wsegs(). C frees each segment after removing its map
// occupant and, when requested, redrawing that square.
function toss_wsegs(segments, displayUpdate, rawEnv = {}) {
    const env = wormEnvironment(rawEnv);
    for (const segment of segments ?? []) {
        if (!segment.x) continue;
        remove_monster(segment.x, segment.y, env.state);
        if (displayUpdate) redrawWormSquare(segment.x, segment.y, env);
    }
}

// C ref: worm.c shrink_worm(). Remove the tail segment (the first list node).
function shrink_worm(wnum, rawEnv = {}) {
    const env = wormEnvironment(rawEnv);
    const segments = wormSlots(env.state)[wnum]?.segments;
    if (!segments || segments.length <= 1) return;
    const tail = segments[0];
    wormSlots(env.state)[wnum].segments = segments.slice(1);
    toss_wsegs([tail], true, env);
}

// C ref: worm.c place_wsegs(). Coordinates in each segment remain the sole
// owner of long-worm tail positions; the final hidden node tracks the head.
export function place_wsegs(worm, oldworm = null, rawEnv = {}) {
    const env = wormEnvironment(rawEnv);
    const segments = wormSlots(env.state)[worm.wormno]?.segments;
    if (!segments?.length)
        throw new Error('place_wsegs requires an initialized tail');
    for (const segment of segments.slice(0, -1)) {
        const { x, y } = segment;
        const occupant = m_at(x, y, env.state);
        if (oldworm && occupant === oldworm)
            remove_monster(x, y, env.state);
        // C reports impossible placement conflicts diagnostically and then
        // place_worm_seg still writes the worm into the map. The assignment
        // below preserves that source behavior without a visible substitute.
        env.state.level.monsters[x][y] = worm;
    }
    const head = segments[segments.length - 1];
    head.x = worm.mx;
    head.y = worm.my;
}

// C ref: worm.c remove_worm(). It removes map occupancy but keeps the segment
// record and sets each wx to zero for later placement or migration.
export function remove_worm(monster, rawEnv = {}) {
    const env = wormEnvironment(rawEnv);
    const segments = wormSlots(env.state)[monster.wormno]?.segments ?? [];
    for (const segment of segments) {
        if (!segment.x) continue;
        remove_monster(segment.x, segment.y, env.state);
        redrawWormSquare(segment.x, segment.y, env);
        segment.x = 0;
    }
}

// C ref: worm.c place_worm_tail_randomly(). The array remains in tail-to-head
// order while positions are chosen from the head outward.
export function place_worm_tail_randomly(monster, x, y, rawEnv = {}) {
    const env = wormEnvironment(rawEnv);
    const record = wormSlots(env.state)[monster.wormno];
    if (!record?.segments?.length) {
        if (monster.wormno) note_unported('pline.c impossible');
        return;
    }
    if (record.segments.length === 1) {
        const segment = record.segments[0];
        if (segment.x
            && (segment.x !== monster.mx || segment.y !== monster.my)
            && m_at(segment.x, segment.y, env.state) === monster) {
            remove_monster(segment.x, segment.y, env.state);
        }
        segment.x = monster.mx;
        segment.y = monster.my;
        return;
    }

    const original = record.segments;
    // C clears wheads[wnum] before attempting placement so a failed tail
    // extension cannot remove the real monster from levels.monsters[][].
    const oldHead = original[original.length - 1];
    oldHead.x = 0;
    oldHead.y = 0;
    const hiddenHead = original[0];
    hiddenHead.x = x;
    hiddenHead.y = y;
    const placed = [hiddenHead];
    let previousX = x;
    let previousY = y;
    for (let index = 1; index < original.length; ++index) {
        const next = rnd_nextto_goodpos(
            previousX,
            previousY,
            monster,
            env,
        );
        if (next && typeof next.then === 'function') {
            throw new Error('worm tail placement requires monster goodpos');
        }
        if (!next) {
            toss_wsegs(original.slice(index), false, env);
            break;
        }
        const segment = original[index];
        segment.x = previousX = next.x;
        segment.y = previousY = next.y;
        env.state.level.monsters[next.x][next.y] = monster;
        placed.unshift(segment);
        redrawWormSquare(next.x, next.y, env);
    }
    record.segments = placed;
}

// C ref: worm.c wormgone(). This removes the hidden head as well as visible
// segments, then releases the level-local slot and its growth clock.
export function wormgone(monster, rawEnv = {}) {
    const env = wormEnvironment(rawEnv);
    const wormno = monster.wormno;
    const slots = wormSlots(env.state);
    const record = slots[wormno];
    const segments = record?.segments ?? [];
    if (!wormno) note_unported('pline.c impossible');
    monster.wormno = 0;
    toss_wsegs(segments, true, env);
    // C resets wgrowtime[wnum] before releasing the slot.
    if (record) record.growtime = 0;
    slots[wormno] = null;
    if (monster.data?.pmidx === PM_LONG_WORM && has_mcorpsenm(monster))
        monster.mextra.mcorpsenm = NON_PM;
}

// C ref: worm.c cutworm(). The clone_mon() result is consumed to choose
// between splitting the tail and discarding the detached half.
export async function cutworm(worm, x, y, cuttier, rawEnv = {}) {
    const env = wormEnvironment(rawEnv);
    const { state, random } = env;
    const wnum = worm.wormno;
    if (!wnum || (x === worm.mx && y === worm.my)) return;

    let cutChance = random.rnd(20);
    if (cuttier) cutChance += 10;
    if (cutChance < 17) return;

    const slots = wormSlots(state);
    const record = slots[wnum];
    const segments = record?.segments;
    if (!segments?.length) return;
    const cutIndex = segments.findIndex(
        (segment) => segment.x === x && segment.y === y,
    );
    if (cutIndex < 0) {
        // C reports an impossible internal map/list mismatch and returns.
        note_unported('pline.c impossible');
        return;
    }
    if (cutIndex === 0) {
        shrink_worm(wnum, env);
        return;
    }

    // Split the linked-list equivalent at the struck segment. The old worm
    // keeps the segment after the cut; curr becomes the new worm's hidden head.
    const newTail = segments.slice(0, cutIndex + 1);
    record.segments = segments.slice(cutIndex + 1);

    let newWnum = 0;
    if (worm.m_lev >= 3 && !random.rn2(3)) newWnum = get_wormno(state);
    let newWorm = null;
    if (newWnum) {
        remove_monster(x, y, state);
        newWorm = await clone_mon(worm, x, y, state, {
            ...env,
            random,
        });
    }

    if (!newWorm) {
        // C first restores this coordinate as a worm segment, then tosses the
        // detached half (including that coordinate) with display updates.
        state.level.monsters[x][y] = worm;
        const movingMonster = Boolean(state.context?.mon_moving);
        if (movingMonster) {
            if (canspotmon(worm, state)) {
                await wormMessage(
                    `Part of ${s_suffix(mon_nam(worm, state))} tail has been cut off.`,
                    env,
                );
            }
        } else {
            await wormMessage(
                `You cut part of the tail off of ${mon_nam(worm, state)}.`,
                env,
            );
        }
        toss_wsegs(newTail, true, env);
        if (worm.mhp > 1) worm.mhp = Math.trunc(worm.mhp / 2);
        return;
    }

    newWorm.wormno = newWnum;
    newWorm.mcloned = 0;
    worm.m_lev = Math.max(worm.m_lev - 2, 3);
    newWorm.m_lev = worm.m_lev;
    newWorm.mhpmax = newWorm.mhp = random.d(newWorm.m_lev, 8);
    worm.mhpmax = random.d(worm.m_lev, 8);
    if (worm.mhpmax < worm.mhp) worm.mhp = worm.mhpmax;

    // C initializes wgrowtime[new_wnum] alongside its tail and head links.
    slots[newWnum] = { segments: newTail, growtime: 0 };
    place_wsegs(newWorm, worm, env);
    if (state.context?.mon_moving) {
        await wormMessage(`${Monnam(worm, state)} is cut in half.`, env);
    } else {
        await wormMessage(`You cut ${mon_nam(worm, state)} in half.`, env);
    }
}
