// mkmaze.js -- the level-region placement group of NetHack's mkmaze.c.
//
// C refs: mkmaze.c is_exclusion_zone() (316-332), bad_location() (340-352),
// place_lregion() (355-408) and put_lregion_here() (412-467). Together they
// answer "where on this level does <something> go", and the something this
// port asks about is the hero: dungeon.c u_on_rndspot() sends a level-teleport
// arrival here, and stairs.c u_on_upstairs() falls back to it on a level with
// no up staircase.
//
// The rest of mkmaze.c -- maze carving, the Wizard's tower, wallification and
// the bubble levels -- has no port yet, so this file holds only that group.

import {
    AIR,
    COLNO,
    CORR,
    DEAF,
    LAVAPOOL,
    LR_BRANCH,
    LR_DOWNTELE,
    LR_PORTAL,
    LR_TELE,
    LR_UPTELE,
    MAGIC_PORTAL,
    ROOM,
    ROWNO,
    undestroyable_trap,
} from './const.js';
import { Is_branchlev, on_level, u_on_newpos } from './dungeon.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { place_branch } from './mklev.js';
import { occupied } from './mktrap.js';
import { m_at } from './monst.js';
import { create_gas_cloud } from './region.js';
import { within_bounded_area } from './rect.js';
import { rn1, rn2 } from './rng.js';
import { maketrap, t_at } from './trap.js';
import { ttyNorep } from './tty_message.js';
import { block_point, cansee } from './vision.js';
import { newsym } from './display.js';

// C ref: youprop.h Deaf (125). The roleplay term is kept beside this
// endgame-only caller because the source macro is evaluated after fumaroles
// has consumed every coordinate and cloud-size random number.
function Deaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(deafness?.intrinsic || deafness?.extrinsic)
        || Boolean(state.u?.uroleplay?.deaf);
}

// C ref: mkmaze.c fumaroles(). The Plane of Fire calls create_gas_cloud()
// immediately after arrival, before vision_reset() and the first map redraw.
export async function fumaroles(state = game) {
    let nmax = rn2(3);
    let sizemin = 5;
    let sound = false;
    let loud = false;

    if (on_level(state.u?.uz, state.fire_level)) {
        ++nmax;
        sizemin += 5;
    }
    if ((state.level?.flags?.temperature ?? 0) > 0) {
        ++nmax;
        sizemin += 5;
    }

    for (let count = nmax; count; --count) {
        const x = rn1(COLNO - 4, 3);
        const y = rn1(ROWNO - 4, 3);
        if (state.level.at(x, y).typ !== LAVAPOOL) continue;

        const cloud = await create_gas_cloud(
            x,
            y,
            rn1(10, sizemin),
            rn1(10, 5),
            {
                state,
                random: { rn2 },
                allowPositiveDamage: true,
                blockPoint: (bx, by) => block_point(bx, by, state),
                canSee: (bx, by) => cansee(bx, by, state),
                newsym: (bx, by) => newsym(bx, by),
                message: (line) => ttyNorep(line, state),
            },
        );
        // C clear_heros_fault(r) makes this natural cloud harmless to the
        // hero's temporary fault bookkeeping even though its damage is real.
        cloud.heros_fault = false;
        sound = true;
        if (dist2(x, y, state.u.ux, state.u.uy) < 15) loud = true;
    }
    if (sound && !Deaf(state))
        await ttyNorep(`You hear a ${loud ? 'loud ' : ''}whoosh!`, state);
}

// A region placement that needs an unported operation. Both arms below sit
// inside put_lregion_here()'s `oneshot` handling, which place_lregion() reaches
// only when a single-square region was asked for or when 200 consecutive
// random squares were all unusable.
export class UnsupportedRegionPlacementError extends Error {
    constructor(reason) {
        super(`unsupported region placement: ${reason}`);
        this.name = 'UnsupportedRegionPlacementError';
        this.reason = reason;
    }
}

// C ref: mkmaze.c is_exclusion_zone(). A zone recorded on this level that the
// given placement type must avoid. LR_TELE covers both teleport directions,
// which is why each of the two directional types matches an LR_TELE zone as
// well as its own.
//
// The list is live rather than always empty: js/mklev.js
// add_teleport_exclusion() pushes an LR_TELE zone around the themed
// "Water-surrounded vault", and js/mklev.js clears the list per level.
export function is_exclusion_zone(type, x, y, state = game) {
    for (let ez = state.exclusion_zones ?? null; ez; ez = ez.next) {
        if (((type === LR_DOWNTELE
              && (ez.zonetype === LR_DOWNTELE || ez.zonetype === LR_TELE))
             || (type === LR_UPTELE
                 && (ez.zonetype === LR_UPTELE || ez.zonetype === LR_TELE))
             || type === ez.zonetype)
            && within_bounded_area(x, y, ez.lx, ez.ly, ez.hx, ez.hy))
            return true;
    }
    return false;
}

// C ref: mkmaze.c bad_location(). Its comment: bad if the position is
// occupied, or inside the restricted region, or is not (a corridor on a maze
// level, or a room square, or air).
//
// occupied() is mklev.c's and is ported at js/mktrap.js; it rejects a square
// holding a trap, dungeon furniture, lava, water or the invocation position.
export function bad_location(x, y, nlx, nly, nhx, nhy, state = game) {
    const typ = state.level?.at(x, y)?.typ;
    return Boolean(occupied(x, y, state)
        || within_bounded_area(x, y, nlx, nly, nhx, nhy)
        || !((typ === CORR && state.level?.flags?.is_maze_lev)
             || typ === ROOM
             || typ === AIR));
}

// C ref: mkmaze.c place_lregion(). Pick a square in (lx, ly, hx, hy) but not in
// (nlx, nly, nhx, nhy), and place something there according to `rtype`.
//
// C's eight coordinates come from `svu.updest` and `svd.dndest`, structs
// do.c goto_level() zeroes before every arrival. js/do.js renders that clearing
// as `state.updest = {}`, so an unset field arrives here as undefined where C
// would read 0; `?? 0` restores C's value before any comparison sees it.
// Planning options form one lockstep protocol: `planPositionOnly` traverses
// candidates with `randomOneBased`, calls the required `preflightPosition`
// for the selected square instead of committing it, and must leave every
// selection input unchanged so the caller can replay the traversal live.
export function place_lregion(
    lx, ly, hx, hy,
    nlx, nly, nhx, nhy,
    rtype,
    lev,
    state = game,
    options = {},
) {
    const randomOneBased = options.randomOneBased ?? rn1;
    lx ??= 0;
    ly ??= 0;
    hx ??= 0;
    hy ??= 0;
    nlx ??= 0;
    nly ??= 0;
    nhx ??= 0;
    nhy ??= 0;

    if (!lx) { /* default to whole level */
        // C ref: mkmaze.c:371-374. When defaulting to whole level and rooms
        // exist, let place_branch choose the location to avoid corridors.
        if (rtype === LR_BRANCH && state.level?.nroom) {
            place_branch(Is_branchlev(state.u.uz, state), 0, 0);
            return;
        }
        lx = 1; /* column 0 is not used */
        hx = COLNO - 1;
        ly = 0; /* 3.6.0 and earlier erroneously had 1 here */
        hy = ROWNO - 1;
    }

    /* clamp the area to the map */
    if (lx < 1) lx = 1;
    if (hx > COLNO - 1) hx = COLNO - 1;
    if (ly < 0) ly = 0;
    if (hy > ROWNO - 1) hy = ROWNO - 1;

    /* first a probabilistic approach */

    const oneshot = (lx === hx && ly === hy);
    for (let trycnt = 0; trycnt < 200; trycnt++) {
        const x = randomOneBased((hx - lx) + 1, lx);
        const y = randomOneBased((hy - ly) + 1, ly);
        if (put_lregion_here(x, y, nlx, nly, nhx, nhy, rtype, oneshot, lev,
                             state, options)) {
            return;
        }
    }

    /* then a deterministic one */

    for (let x = lx; x <= hx; x++)
        for (let y = ly; y <= hy; y++)
            if (put_lregion_here(x, y, nlx, nly, nhx, nhy, rtype, true, lev,
                                 state, options))
                return;

    // C's impossible() prints "Couldn't place lregion type %d!" and returns,
    // leaving the caller with whatever position it already had. Nothing in
    // this port can continue sensibly from a hero who was never placed.
    throw new Error(`Couldn't place lregion type ${rtype}!`);
}

// C ref: mkmaze.c put_lregion_here(). Answers whether <x,y> took the placement;
// FALSE asks place_lregion() to try another square.
//
// `oneshot` is TRUE when there is no other square to try: either the region is
// a single square, or the 200 random tries are spent and the deterministic
// sweep is running. Only then does C disturb what is already on the square,
// and both ways it does so are unported.
function put_lregion_here(
    x, y,
    nlx, nly, nhx, nhy,
    rtype,
    oneshot,
    lev,
    state = game,
    options = {},
) {
    if (bad_location(x, y, nlx, nly, nhx, nhy, state)
        || is_exclusion_zone(rtype, x, y, state)) {
        if (!oneshot) {
            return false; /* caller should try again */
        }
        /* Must make do with the only location possible;
           avoid failure due to a misplaced trap. */
        const trap = t_at(x, y, state);
        if (trap && !undestroyable_trap(trap.ttyp)) {
            // mkmaze.c:435-439 frees the trapped flag of any monster standing
            // in it and calls trap.c deltrap(), neither of which is ported.
            throw new UnsupportedRegionPlacementError(
                'put_lregion_here() clearing a trap off the only square left',
            );
        }
        if (bad_location(x, y, nlx, nly, nhx, nhy, state)
            || is_exclusion_zone(rtype, x, y, state))
            return false;
    }
    switch (rtype) {
    case LR_TELE:
    case LR_UPTELE:
    case LR_DOWNTELE: {
        /* "something" means the player in this case */
        const mtmp = m_at(x, y, state);
        if (mtmp) {
            /* move the monster if no choice, or just try again */
            if (oneshot) {
                // mkmaze.c:449-450, rloc() and then mon.c m_into_limbo(). The
                // second migrates the monster off the map, which this port has
                // no arrival path for.
                throw new UnsupportedRegionPlacementError(
                    'put_lregion_here() displacing the monster already there',
                );
            }
            return false;
        }
        if (options.planPositionOnly) {
            if (typeof options.preflightPosition !== 'function') {
                throw new TypeError(
                    'planned region placement requires a position preflight',
                );
            }
            options.preflightPosition(x, y, state);
        } else {
            u_on_newpos(x, y, state, options);
        }
        break;
    }
    case LR_BRANCH:
        // C ref: mkmaze.c:464-465. place_branch(Is_branchlev(&u.uz), x, y).
        place_branch(Is_branchlev(state.u.uz, state), x, y);
        break;
    case LR_PORTAL: {
        // C ref: mkmaze.c:450-454 mkportal(). A portal is a magic portal
        // trap whose destination is the level region's resolved d_level.
        const portal = maketrap(x, y, MAGIC_PORTAL, { state });
        if (portal && lev) portal.dst = { ...lev };
        break;
    }
    default:
        // LR_DOWNSTAIR and LR_UPSTAIR reach mkstairs(). Special-level
        // construction is their only caller and neither is routed through
        // this function yet.
        throw new UnsupportedRegionPlacementError(
            `put_lregion_here() for region type ${rtype}`,
        );
    }
    return true;
}
