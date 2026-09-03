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
    CLOUD,
    COLNO,
    CORR,
    DEAF,
    HWALL,
    LAVAPOOL,
    LR_BRANCH,
    LR_DOWNSTAIR,
    LR_DOWNTELE,
    LR_PORTAL,
    LR_TELE,
    LR_UPTELE,
    LR_UPSTAIR,
    MAGIC_PORTAL,
    ROOM,
    ROWNO,
    STONE,
    undestroyable_trap,
} from './const.js';
import { Is_branchlev, on_level, u_on_newpos } from './dungeon.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { mkstairs, place_branch, walkfrom } from './mklev.js';
import { occupied } from './mktrap.js';
import { m_at } from './monst.js';
import { create_gas_cloud } from './region.js';
import { within_bounded_area } from './rect.js';
import { rn1, rn2, rnd } from './rng.js';
import { maketrap, t_at } from './trap.js';
import { ttyNorep } from './tty_message.js';
import {
    block_point,
    cansee,
    recalc_block_point,
} from './vision.js';
import { cmap_to_glyph, newsym } from './display.js';
import { S_air, S_cloud } from './symbols.js';

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

// C ref: mkmaze.c setup_waterlevel() (1812-1858), for the Plane of Air arm.
// The C implementation keeps these as file-scope bubble lists. This port
// keeps the same mutable records on the game state so the arrival pass can
// consume the exact masks and directions setup created.
const AIR_BUBBLE_MASKS = Object.freeze([
    Object.freeze({ width: 2, height: 1, rows: [0x3] }),
    Object.freeze({ width: 3, height: 2, rows: [0x7, 0x7] }),
    Object.freeze({ width: 4, height: 3, rows: [0x6, 0xf, 0x6] }),
    Object.freeze({ width: 5, height: 3, rows: [0xe, 0x1f, 0xe] }),
    Object.freeze({ width: 6, height: 4, rows: [0x1e, 0x3f, 0x3f, 0x1e] }),
    Object.freeze({ width: 7, height: 4, rows: [0x3e, 0x7f, 0x7f, 0x3e] }),
    Object.freeze({ width: 8, height: 4, rows: [0x7e, 0xff, 0xff, 0x7e] }),
]);

function airBubbleBounds() {
    // C's svx/svy are initialized by setup_waterlevel().
    return { xmin: 4, ymin: 2, xmax: 77, ymax: 19 };
}

function resetAirLocation(location, typ = AIR) {
    // C's assignment from the static air_pos rm record resets the terrain
    // fields but does not touch objects, traps, or the level-wide indices.
    location.typ = typ;
    location.lit = true;
    location.flags = 0;
    location.doormask = 0;
    location.seenv = 0;
    location.horizontal = false;
    location.edge = false;
    location.wall_info = 0;
    location.roomno = 0;
}

function moveAirBubble(bubble, dx, dy, initial, state, random = rn2) {
    const bounds = airBubbleBounds();
    let collision = 0;
    // mkmaze.c:1702-1704. Clouds move only when the one-in-six test passes.
    if (!random(6)) {
        if (dx < -1 || dx > 1 || dy < -1 || dy > 1) {
            dx = Math.sign(dx);
            dy = Math.sign(dy);
        }

        if (bubble.x <= bounds.xmin) collision |= 2;
        if (bubble.y <= bounds.ymin) collision |= 1;
        if (bubble.x + bubble.mask.width - 1 >= bounds.xmax) collision |= 2;
        if (bubble.y + bubble.mask.height - 1 >= bounds.ymax) collision |= 1;

        if (bubble.x < bounds.xmin) bubble.x = bounds.xmin;
        if (bubble.y < bounds.ymin) bubble.y = bounds.ymin;
        if (bubble.x + bubble.mask.width - 1 > bounds.xmax)
            bubble.x = bounds.xmax - bubble.mask.width + 1;
        if (bubble.y + bubble.mask.height - 1 > bounds.ymax)
            bubble.y = bounds.ymax - bubble.mask.height + 1;

        if (bubble.x === bounds.xmin && dx < 0) dx = -dx;
        if (bubble.x + bubble.mask.width - 1 === bounds.xmax && dx > 0)
            dx = -dx;
        if (bubble.y === bounds.ymin && dy < 0) dy = -dy;
        if (bubble.y + bubble.mask.height - 1 === bounds.ymax && dy > 0)
            dy = -dy;

        bubble.x += dx;
        bubble.y += dy;

    }

    // mkmaze.c:1757-1772. Each set bit is a cloud cell and blocks vision.
    for (let i = 0; i < bubble.mask.width; ++i) {
        for (let j = 0; j < bubble.mask.height; ++j) {
            if (!(bubble.mask.rows[j] & (1 << i))) continue;
            const location = state.level.at(bubble.x + i, bubble.y + j);
            if (!location) continue;
            location.typ = CLOUD;
            location.lit = true;
            block_point(bubble.x + i, bubble.y + j, state);
        }
    }

    // mkmaze.c:2087-2105. Bounce or occasionally reroll a bubble's
    // direction after it has been drawn. There are no contents on Air's
    // newly-created bubbles, so the Water-only container loop is absent.
    if (collision === 1) {
        bubble.dy = -bubble.dy;
    } else if (collision === 3) {
        bubble.dy = -bubble.dy;
        bubble.dx = -bubble.dx;
    } else if (collision === 2) {
        bubble.dx = -bubble.dx;
    } else if (!initial && (bubble.dx || bubble.dy
        ? !random(20) : !random(5))) {
        bubble.dx = 1 - random(3);
        bubble.dy = 1 - random(3);
    }
}

function makeAirBubble(x, y, mask, state, random = rn2) {
    if (x >= 77 || y >= 19) return;
    if (x + mask.width - 1 > 77) x = 77 - mask.width + 1;
    if (y + mask.height - 1 > 19) y = 19 - mask.height + 1;
    const bubble = {
        x,
        y,
        dx: 1 - random(3),
        dy: 1 - random(3),
        mask,
    };
    state.air_bubbles.push(bubble);
    // mv_bubble(..., TRUE) still performs the Air one-in-six draw and draws
    // the mask, but does not reroll the direction afterward.
    moveAirBubble(bubble, 0, 0, true, state, random);
}

// C ref: mkmaze.c setup_waterlevel() (1812-1858). Only the Air arm is
// reachable in the current port; Water retains its explicit boundary.
export function setup_waterlevel(state = game, random = rn2) {
    if (!on_level(state.u?.uz, state.air_level)) return;

    state.level.flags.hero_memory = false;
    state.air_bubbles = [];
    for (let x = 1; x <= COLNO - 1; ++x) {
        for (let y = 0; y <= ROWNO - 1; ++y) {
            resetAirLocation(state.level.at(x, y));
            // C setup_waterlevel() stores the base element's glyph in every
            // level cell. movebubbles() later replaces the live glyph with
            // S_cloud; the initial level memory is S_air, so unexplored Air
            // cells display as blank rather than as cloud markers.
            state.level.at(x, y).remembered_glyph = {
                glyph: cmap_to_glyph(S_air, state),
            };
        }
    }

    const xskip = 6 + random(4);
    const yskip = 3 + random(3);
    const bounds = airBubbleBounds();
    for (let x = bounds.xmin; x <= bounds.xmax; x += xskip) {
        for (let y = bounds.ymin; y <= bounds.ymax; y += yskip)
            makeAirBubble(x, y, AIR_BUBBLE_MASKS[random(7)], state, random);
    }
}

// C ref: mkmaze.c movebubbles() (1539-1646, 1660-1727), Air-level arm.
// Called once when arriving on Air; the per-turn caller remains outside this
// candidate until a development session exercises cloud movement after an
// action on the plane.
export function movebubbles(state = game, random = rn2) {
    if (!on_level(state.u?.uz, state.air_level)) return;
    const bounds = airBubbleBounds();

    for (let x = 1; x <= COLNO - 1; ++x) {
        for (let y = 0; y <= ROWNO - 1; ++y) {
            const location = state.level.at(x, y);
            resetAirLocation(location);
            // C movebubbles() assigns air_pos, whose live glyph is
            // S_cloud. The remembered glyph is the port's stored equivalent
            // of C's levl[x][y].glyph and must change with that assignment.
            location.remembered_glyph = {
                glyph: cmap_to_glyph(S_cloud, state),
            };
            recalc_block_point(x, y, state);

            // C breaks up the all-air perimeter. Note that the edge test is
            // intentionally evaluated for column 1 and row 0 as well.
            const xedge = x < bounds.xmin || x > bounds.xmax;
            const yedge = y < bounds.ymin || y > bounds.ymax;
            if ((xedge || yedge) && !random(xedge ? 3 : 5)) {
                location.typ = CLOUD;
                block_point(x, y, state);
            }
        }
    }

    // C's static `up` toggles before traversing the lists. New levels start
    // false, so the first arrival walks the setup list in creation order.
    state.air_bubbles_up = !state.air_bubbles_up;
    const bubbles = state.air_bubbles_up
        ? state.air_bubbles
        : [...state.air_bubbles].reverse();
    for (const bubble of bubbles) {
        const rx = random(3);
        const ry = random(3);
        const dx = bubble.dx + 1
            - (!bubble.dx ? rx : (rx ? 1 : 0));
        const dy = bubble.dy + 1
            - (!bubble.dy ? ry : (ry ? 1 : 0));
        moveAirBubble(bubble, dx, dy, false, state, random);
    }
    state.vision_full_recalc = 1;
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
    case LR_DOWNSTAIR:
    case LR_UPSTAIR:
        // C ref: mkmaze.c:456-459. Special-level stair regions are resolved
        // before generate_stairs(), so the latter must see the stair already
        // present and avoid consuming its fallback room-selection draws.
        mkstairs(x, y, rtype === LR_UPSTAIR ? 1 : 0, null);
        break;
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

// C ref: mkmaze.c maze0xy() (309-314). Picks a random odd-coordinate
// starting point inside the given maze bounds (xMax, yMax).
function maze0xy(xMax, yMax) {
    const x = 3 + 2 * rn2((xMax >> 1) - 1);
    const y = 3 + 2 * rn2((yMax >> 1) - 1);
    return { x, y };
}

// C ref: mkmaze.c create_maze() (950-1039). Generates a maze with the
// specified corridor width and wall thickness, then scales it up when
// the combined scale exceeds 2. walkfrom() carves from maze0xy()'s
// random start; the bounds are temporarily reduced to keep the small
// grid inside the map.
export function create_maze(corrwid, wallthick, rmDeadends, frame, state) {
    if (corrwid === -1) corrwid = rnd(4);
    if (wallthick === -1) wallthick = rnd(4) - corrwid;
    if (wallthick < 1) wallthick = 1;
    else if (wallthick > 5) wallthick = 5;
    if (corrwid < 1) corrwid = 1;
    else if (corrwid > 5) corrwid = 5;

    const scale = corrwid + wallthick;
    const rdx = Math.trunc(frame.xMazeMax / scale);
    const rdy = Math.trunc(frame.yMazeMax / scale);

    // Fill the reduced grid: corrmaze fills with STONE; otherwise,
    // odd-parity cells are STONE (walls) and even-parity cells are HWALL.
    if (state.level.flags.corrmaze) {
        for (let x = 2; x < rdx * 2; ++x)
            for (let y = 2; y < rdy * 2; ++y)
                state.level.at(x, y).typ = STONE;
    } else {
        for (let x = 2; x <= rdx * 2; ++x)
            for (let y = 2; y <= rdy * 2; ++y)
                state.level.at(x, y).typ = ((x % 2) && (y % 2))
                    ? STONE : HWALL;
    }

    // Temporarily reduce bounds for maze carving.
    const bounds = { xMax: rdx * 2, yMax: rdy * 2 };

    const mm = maze0xy(bounds.xMax, bounds.yMax);
    walkfrom(mm.x, mm.y, 0, state, bounds);

    // rmDeadends would call maze_remove_deadends(); not needed for
    // the current hells[5] arm where deadends defaults to true
    // (rm_deadends = false).

    // Scale maze up when scale > 2.
    if (scale > 2) {
        // Back up the smaller maze into a temporary map.
        const tmpmap = [];
        for (let x = 0; x < COLNO; ++x) {
            tmpmap[x] = new Uint8Array(ROWNO);
            for (let y = 0; y < ROWNO; ++y) {
                tmpmap[x][y] = state.level.at(x, y).typ;
            }
        }

        // Scale: walk the reduced grid and expand each cell according
        // to its parity. Odd columns/rows (corridors) get corrwid cells;
        // even columns/rows (walls) get wallthick cells, except the
        // boundary columns/rows (x==2 or x==rdx*2, y==2 or y==rdy*2)
        // which get 1 cell.
        let rx = 2, x = 2;
        while (rx < frame.xMazeMax) {
            const mx = (x % 2)
                ? corrwid
                : (x === 2 || x === rdx * 2) ? 1 : wallthick;
            let ry = 2, y2 = 2;
            while (ry < frame.yMazeMax) {
                const my = (y2 % 2)
                    ? corrwid
                    : (y2 === 2 || y2 === rdy * 2) ? 1 : wallthick;
                for (let dx = 0; dx < mx; ++dx) {
                    for (let dy = 0; dy < my; ++dy) {
                        if (rx + dx >= frame.xMazeMax
                            || ry + dy >= frame.yMazeMax) break;
                        state.level.at(rx + dx, ry + dy).typ = tmpmap[x][y2];
                    }
                }
                ry += my;
                y2++;
            }
            rx += mx;
            x++;
        }
    }
}
