// sp_lev.js -- sp_lev.c level transposition functions (428-985).
// Other special-level groups retain their existing modules.
import { game } from './gstate.js';
import { COLNO, ROWNO, DB_DIR, DB_WEST, DB_EAST, DB_NORTH, DB_SOUTH,
    EGD, EPRI, ESHK, IS_DRAWBRIDGE, IS_WALL, SDOOR, SVALL,
    ROLLING_BOULDER_TRAP, OBJ_FREE, MELT_ICE_AWAY, is_pit } from './const.js';
import { swapbits } from './hacklib.js';
import { carried } from './obj.js';
import { on_level } from './dungeon.js';
import { back_to_glyph, glyph_is_cmap, set_wall_state } from './display.js';
import { get_level_extends } from './mkmaze.js';
import { fix_wall_spines } from './mklev.js';
import { placebc, unplacebc } from './ball.js';
import { vision_reset } from './vision.js';
import { rn2 } from './rng.js';
import { note_unported } from './unported.js';

// C ref: sp_lev.c flip_dbridge_horizontal(). A drawbridge facing west now
// faces east, and the reverse.
function flip_dbridge_horizontal(lev) {
    if (IS_DRAWBRIDGE(lev.typ)) {
        if ((lev.flags & DB_DIR) === DB_WEST) {
            lev.flags &= ~DB_WEST;
            lev.flags |= DB_EAST;
        } else if ((lev.flags & DB_DIR) === DB_EAST) {
            lev.flags &= ~DB_EAST;
            lev.flags |= DB_WEST;
        }
    }
}

// C ref: sp_lev.c flip_dbridge_vertical(). A drawbridge facing north now
// faces south, and the reverse.
function flip_dbridge_vertical(lev) {
    if (IS_DRAWBRIDGE(lev.typ)) {
        if ((lev.flags & DB_DIR) === DB_NORTH) {
            lev.flags &= ~DB_NORTH;
            lev.flags |= DB_SOUTH;
        } else if ((lev.flags & DB_DIR) === DB_SOUTH) {
            lev.flags &= ~DB_SOUTH;
            lev.flags |= DB_NORTH;
        }
    }
}

// C ref: sp_lev.c flip_visuals(). For #wizfliplevel; not needed when
// flipping during level creation. Updates the seen vector of every seen
// square in the flip area and the glyph of remembered walls.
function flip_visuals(flp, minx, miny, maxx, maxy, state = game) {
    for (let y = miny; y <= maxy; ++y) {
        for (let x = minx; x <= maxx; ++x) {
            const lev = state.level.at(x, y);
            let seenv = lev.seenv & 0xff;
            /* locations which haven't been seen can be skipped */
            if (seenv === 0)
                continue;
            /* flip <x,y>'s seen vector; not necessary for locations seen
               from all directions (the whole level after magic mapping) */
            if (seenv !== SVALL) {
                /* SV2 SV1 SV0 *
                 * SV3 -+- SV7 *
                 * SV4 SV5 SV6 */
                if (flp & 1) { /* swap top and bottom */
                    seenv = swapbits(seenv, 2, 4);
                    seenv = swapbits(seenv, 1, 5);
                    seenv = swapbits(seenv, 0, 6);
                }
                if (flp & 2) { /* swap left and right */
                    seenv = swapbits(seenv, 2, 0);
                    seenv = swapbits(seenv, 3, 7);
                    seenv = swapbits(seenv, 4, 6);
                }
                lev.seenv = seenv & 0xff;
            }
            /* if <x,y> is displayed as a wall, reset its display glyph so
               that remembered, out of view T's and corners get flipped */
            if ((IS_WALL(lev.typ) || lev.typ === SDOOR)
                && glyph_is_cmap(lev.remembered_glyph?.glyph))
                lev.remembered_glyph = { glyph: back_to_glyph(x, y, state) };
        }
    }
}

// C ref: sp_lev.c flip_encoded_dir_bits(). Transposes an encoded direction
// bit set (the xdir[]/ydir[] order) for a vertical (flp & 1) or horizontal
// (flp & 2) flip.
export function flip_encoded_dir_bits(flp, val) {
    /* these depend on xdir[] and ydir[] order */
    if (flp & 1) {
        val = swapbits(val, 1, 7);
        val = swapbits(val, 2, 6);
        val = swapbits(val, 3, 5);
    }
    if (flp & 2) {
        val = swapbits(val, 1, 3);
        val = swapbits(val, 0, 4);
        val = swapbits(val, 7, 5);
    }

    return val;
}

// C ref: sp_lev.c flip_vault_guard(). For #wizfliplevel; flips the guard's
// egd data (its two goal squares and the fake corridor) within the flip
// area. Not needed for level creation.
export function flip_vault_guard(flp, grd, minx, miny, maxx, maxy) {
    const FlipX = (val) => (maxx - val) + minx;
    const FlipY = (val) => (maxy - val) + miny;
    const inFlipArea = (x, y) => x >= minx && x <= maxx
        && y >= miny && y <= maxy;
    const egd = EGD(grd);

    if (inFlipArea(egd.gdx, egd.gdy)) {
        if (flp & 1)
            egd.gdy = FlipY(egd.gdy);
        if (flp & 2)
            egd.gdx = FlipX(egd.gdx);
    }
    if (inFlipArea(egd.ogx, egd.ogy)) {
        if (flp & 1)
            egd.ogy = FlipY(egd.ogy);
        if (flp & 2)
            egd.ogx = FlipX(egd.ogx);
    }
    for (let i = egd.fcbeg; i < egd.fcend; ++i) {
        const fx = egd.fakecorr[i].fx, fy = egd.fakecorr[i].fy;

        if (inFlipArea(fx, fy)) {
            if (flp & 1)
                egd.fakecorr[i].fy = FlipY(fy);
            if (flp & 2)
                egd.fakecorr[i].fx = FlipX(fx);
        }
    }
}

// C ref: sp_lev.c flip_level() (533-925). Level generation passes
// extras=false; the live wizard command also flips hero and active context.
export async function flip_level(flp, extras = false, state = game) {
    if ((flp & 3) === 0) return;

    let { xmin: minx, xmax: maxx, ymin: miny, ymax: maxy } = get_level_extends(state);
    if (miny < 0) miny = 0;
    if (minx < 1) minx = 1;
    if (maxx >= COLNO) maxx = COLNO - 1;
    if (maxy >= ROWNO) maxy = ROWNO - 1;

    const FlipX = (val) => (maxx - val) + minx;
    const FlipY = (val) => (maxy - val) + miny;
    const inFlipArea = (x, y) => x >= minx && x <= maxx && y >= miny && y <= maxy;

    const level = state.level;
    const flipCoord = coord => {
        if (coord?.x && inFlipArea(coord.x, coord.y)) {
            if (flp & 1) coord.y = FlipY(coord.y);
            if (flp & 2) coord.x = FlipX(coord.x);
        }
    };
    let ballActive = false, ballFlipArea = false;
    if (extras && state.uball && state.uball.where !== OBJ_FREE) {
        ballActive = true;
        if (carried(state.uball)) {
            state.uball.ox = state.u.ux;
            state.uball.oy = state.u.uy;
        }
        ballFlipArea = inFlipArea(state.uball.ox, state.uball.oy)
            === inFlipArea(state.uchain.ox, state.uchain.oy)
            && inFlipArea(state.uball.ox, state.uball.oy)
                === inFlipArea(state.u.ux, state.u.uy);
        if (!ballFlipArea) unplacebc(state);
    }

    // C ref: sp_lev.c:587-592. Stairs and ladders.
    for (let stway = state.stairs; stway; stway = stway.next) {
        if (flp & 1) stway.sy = FlipY(stway.sy);
        if (flp & 2) stway.sx = FlipX(stway.sx);
    }

    // C ref: sp_lev.c:594-616. Traps.
    for (const trap of level.traps) {
        if (!inFlipArea(trap.tx, trap.ty)) continue;
        if (flp & 1) {
            trap.ty = FlipY(trap.ty);
            if (trap.ttyp === ROLLING_BOULDER_TRAP) {
                trap.launch.y = FlipY(trap.launch.y);
                trap.launch2.y = FlipY(trap.launch2.y);
            } else if (is_pit(trap.ttyp) && trap.conjoined) {
                trap.conjoined = flip_encoded_dir_bits(flp, trap.conjoined);
            }
        }
        if (flp & 2) {
            trap.tx = FlipX(trap.tx);
            if (trap.ttyp === ROLLING_BOULDER_TRAP) {
                trap.launch.x = FlipX(trap.launch.x);
                trap.launch2.x = FlipX(trap.launch2.x);
            } else if (is_pit(trap.ttyp) && trap.conjoined) {
                trap.conjoined = flip_encoded_dir_bits(flp, trap.conjoined);
            }
        }
    }

    // C ref: sp_lev.c:618-626. Floor objects.
    for (let otmp = level.objlist; otmp; otmp = otmp.nobj) {
        if (!inFlipArea(otmp.ox, otmp.oy)) continue;
        if (flp & 1) otmp.oy = FlipY(otmp.oy);
        if (flp & 2) otmp.ox = FlipX(otmp.ox);
    }

    // C ref: sp_lev.c:628-636. Buried objects.
    for (let otmp = level.buriedobjlist; otmp; otmp = otmp.nobj) {
        if (!inFlipArea(otmp.ox, otmp.oy)) continue;
        if (flp & 1) otmp.oy = FlipY(otmp.oy);
        if (flp & 2) otmp.ox = FlipX(otmp.ox);
    }

    // C ref: sp_lev.c:638-673. Monsters.
    for (let mtmp = level.monlist; mtmp; mtmp = mtmp.nmon) {
        if (mtmp.isgd) {
            if (extras) /* flip mtmp->mextra->egd */
                flip_vault_guard(flp, mtmp, minx, miny, maxx, maxy);
            if (mtmp.mx === 0) /* not on map so don't flip guard->mx,my */
                continue;
        }
        /* skip the occasional earth elemental outside the flip area */
        if (!inFlipArea(mtmp.mx, mtmp.my)) continue;
        if (flp & 1) mtmp.my = FlipY(mtmp.my);
        if (flp & 2) mtmp.mx = FlipX(mtmp.mx);
        flipCoord(mtmp.mgoal);
        if (mtmp.ispriest) {
            flipCoord(EPRI(mtmp).shrpos);
        } else if (mtmp.isshk) {
            flipCoord(ESHK(mtmp).shk);
            flipCoord(ESHK(mtmp).shd);
        } else if (mtmp.wormno) {
            if (flp & 1) note_unported('worm.c flip_worm_segs_vertical');
            if (flp & 2) note_unported('worm.c flip_worm_segs_horizontal');
        }
    }
    if (extras) {
        for (let mtmp = state.gm?.migrating_mons; mtmp; mtmp = mtmp.nmon) {
            if (mtmp.isgd && on_level(state.u.uz, EGD(mtmp).gdlevel)) {
                flip_vault_guard(flp, mtmp, minx, miny, maxx, maxy);
            } else if (mtmp.ispriest && on_level(state.u.uz, EPRI(mtmp).shrlevel)) {
                flipCoord(EPRI(mtmp).shrpos);
            } else if (mtmp.isshk && on_level(state.u.uz, ESHK(mtmp).shoplevel)) {
                flipCoord(ESHK(mtmp).shk);
                flipCoord(ESHK(mtmp).shd);
            }
        }
    }

    // C ref: sp_lev.c:689-695. Engravings.
    for (let etmp = state.head_engr; etmp; etmp = etmp.nxt_engr) {
        if (flp & 1) etmp.engr_y = FlipY(etmp.engr_y);
        if (flp & 2) etmp.engr_x = FlipX(etmp.engr_x);
    }

    // C ref: sp_lev.c:697-733. Level (teleport) regions, which
    // levregion_add() stored and fixup_special() has not consumed yet. Both
    // areas are mirrored, an absent exclusion's -1 corners included.
    for (const lr of state.lregions) {
        for (const area of [lr.inarea, lr.delarea]) {
            if (flp & 1) {
                area.y1 = FlipY(area.y1);
                area.y2 = FlipY(area.y2);
                if (area.y1 > area.y2) {
                    const t = area.y1; area.y1 = area.y2; area.y2 = t;
                }
            }
        }
        for (const area of [lr.inarea, lr.delarea]) {
            if (flp & 2) {
                area.x1 = FlipX(area.x1);
                area.x2 = FlipX(area.x2);
                if (area.x1 > area.x2) {
                    const t = area.x1; area.x1 = area.x2; area.x2 = t;
                }
            }
        }
    }

    // C ref: sp_lev.c:735-762. Active regions (poison clouds, etc.).
    for (const region of level.regions) {
        const bb = region.bounding_box;
        if (flp & 1) {
            const t1 = FlipY(bb.ly), t2 = FlipY(bb.hy);
            bb.ly = Math.min(t1, t2); bb.hy = Math.max(t1, t2);
            for (const rect of region.rects) {
                const r1 = FlipY(rect.ly), r2 = FlipY(rect.hy);
                rect.ly = Math.min(r1, r2); rect.hy = Math.max(r1, r2);
            }
        }
        if (flp & 2) {
            const t1 = FlipX(bb.lx), t2 = FlipX(bb.hx);
            bb.lx = Math.min(t1, t2); bb.hx = Math.max(t1, t2);
            for (const rect of region.rects) {
                const r1 = FlipX(rect.lx), r2 = FlipX(rect.hx);
                rect.lx = Math.min(r1, r2); rect.hx = Math.max(r1, r2);
            }
        }
    }

    // C ref: sp_lev.c:764-811. Rooms and subrooms.
    for (const sroom of level.rooms) {
        if (sroom.hx < 0) break;
        if (flp & 1) {
            sroom.ly = FlipY(sroom.ly); sroom.hy = FlipY(sroom.hy);
            if (sroom.ly > sroom.hy) { const t = sroom.ly; sroom.ly = sroom.hy; sroom.hy = t; }
        }
        if (flp & 2) {
            sroom.lx = FlipX(sroom.lx); sroom.hx = FlipX(sroom.hx);
            if (sroom.lx > sroom.hx) { const t = sroom.lx; sroom.lx = sroom.hx; sroom.hx = t; }
        }
        if (sroom.sbrooms) {
            for (const sub of sroom.sbrooms) {
                if (flp & 1) {
                    sub.ly = FlipY(sub.ly); sub.hy = FlipY(sub.hy);
                    if (sub.ly > sub.hy) { const t = sub.ly; sub.ly = sub.hy; sub.hy = t; }
                }
                if (flp & 2) {
                    sub.lx = FlipX(sub.lx); sub.hx = FlipX(sub.hx);
                    if (sub.lx > sub.hx) { const t = sub.lx; sub.lx = sub.hx; sub.hx = t; }
                }
            }
        }
    }

    // C ref: sp_lev.c:813-816. Doors.
    for (let i = 0; i < level.doorindex; i++) flipCoord(level.doors[i]);

    // C ref: sp_lev.c:818-860. The map: swap terrain, object grid, and
    // monster grid, turning drawbridges to face the other way first.
    if (flp & 1) {
        for (let x = minx; x <= maxx; x++) {
            const half = miny + Math.trunc((maxy - miny + 1) / 2);
            for (let y = miny; y < half; y++) {
                const ny = FlipY(y);

                flip_dbridge_vertical(level.locations[x][y]);
                flip_dbridge_vertical(level.locations[x][ny]);

                const trm = level.locations[x][y];
                level.locations[x][y] = level.locations[x][ny];
                level.locations[x][ny] = trm;
                const otmp = level.objects[x][y];
                level.objects[x][y] = level.objects[x][ny];
                level.objects[x][ny] = otmp;
                const mtmp = level.monsters[x][y];
                level.monsters[x][y] = level.monsters[x][ny];
                level.monsters[x][ny] = mtmp;
            }
        }
    }
    if (flp & 2) {
        const half = minx + Math.trunc((maxx - minx + 1) / 2);
        for (let x = minx; x < half; x++) {
            for (let y = miny; y <= maxy; y++) {
                const nx = FlipX(x);

                flip_dbridge_horizontal(level.locations[x][y]);
                flip_dbridge_horizontal(level.locations[nx][y]);

                const trm = level.locations[x][y];
                level.locations[x][y] = level.locations[nx][y];
                level.locations[nx][y] = trm;
                const otmp = level.objects[x][y];
                level.objects[x][y] = level.objects[nx][y];
                level.objects[nx][y] = otmp;
                const mtmp = level.monsters[x][y];
                level.monsters[x][y] = level.monsters[nx][y];
                level.monsters[nx][y] = mtmp;
            }
        }
    }

    // C ref: sp_lev.c:862-875. Packed coordinates of positional ice timers.
    for (let timer = state.gt?.timer_base; timer; timer = timer.next) {
        if (timer.func_index === MELT_ICE_AWAY) {
            let ty = timer.arg & 0xffff, tx = (timer.arg >> 16) & 0xffff;
            if (flp & 1) ty = FlipY(ty);
            if (flp & 2) tx = FlipX(tx);
            timer.arg = (tx << 16) | ty;
        }
    }

    // C ref: sp_lev.c:877-896. Exclusion zones.
    for (let ez = state.exclusion_zones; ez; ez = ez.next) {
        if (flp & 1) {
            ez.ly = FlipY(ez.ly); ez.hy = FlipY(ez.hy);
            if (ez.ly > ez.hy) { const t = ez.ly; ez.ly = ez.hy; ez.hy = t; }
        }
        if (flp & 2) {
            ez.lx = FlipX(ez.lx); ez.hx = FlipX(ez.hx);
            if (ez.lx > ez.hx) { const t = ez.lx; ez.lx = ez.hx; ez.hx = t; }
        }
    }

    if (extras) {
        const u = state.u;
        if (inFlipArea(u.ux, u.uy)) {
            if (flp & 1) u.uy = FlipY(u.uy);
            if (flp & 2) u.ux = FlipX(u.ux);
            u.ux0 = u.ux; u.uy0 = u.uy;
        }
        if (ballActive && !ballFlipArea) await placebc(state);
        flipCoord(state.iflags?.travelcc);
        flipCoord(state.context?.digging?.pos);
    }

    // C ref: sp_lev.c:915. Recalculate wall junction types after the swap.
    fix_wall_spines(1, 0, COLNO - 1, ROWNO - 1, state);
    if (extras && flp) {
        set_wall_state(state);
        /* after wall_spines; flips seenv and wall joins */
        flip_visuals(flp, minx, miny, maxx, maxy, state);
    }
    vision_reset(state);
}

// C ref: sp_lev.c flip_level_rnd() (967-982). Each bit of flp enables one
// axis; each enabled axis consumes rn2(2). When the combined result is
// nonzero, flip_level() mirrors the map.
export async function flip_level_rnd(flp, extras = false, state = game, env = {}) {
    const random = env.random ?? { rn2 };
    let c = 0;
    if ((flp & 1) && random.rn2(2)) c |= 1;
    if ((flp & 2) && random.rn2(2)) c |= 2;
    if (c) await flip_level(c, extras, state);
}
