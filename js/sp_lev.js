// sp_lev.js -- sp_lev.c, the special-level loader: level transposition
// (flip_level() and its helpers), the des.* bindings (lspo_*), room, door,
// corridor and trap creation, map fragments, and level fills. Object
// creation is in sp_lev_object.js; create_monster() is in themeroom_fill.js
// and the get_location() family in room_coordinates.js.
import { game } from './gstate.js';
import {
    swapbits,
    lcase,
    str_lines_maxlen,
    stripdigits,
    strstri,
} from './hacklib.js';
import { isok } from './cmd_isok.js';
import {
    COLNO,
    ROWNO,
    DB_DIR,
    DB_WEST,
    DB_EAST,
    DB_NORTH,
    DB_SOUTH,
    EGD,
    EPRI,
    ESHK,
    IS_DRAWBRIDGE,
    IS_WALL,
    SDOOR,
    SVALL,
    ROLLING_BOULDER_TRAP,
    OBJ_FREE,
    MELT_ICE_AWAY,
    is_pit,
    XLIM,
    YLIM,
    STONE,
    ROOM,
    CORR,
    DOOR,
    STAIRS,
    LADDER,
    LA_UP,
    LA_DOWN,
    DRY,
    WET,
    HOT,
    HWALL,
    VWALL,
    CROSSWALL,
    D_NODOOR,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_TRAPPED,
    D_SECRET,
    OROOM,
    THEMEROOM,
    COURT,
    SWAMP,
    VAULT,
    BEEHIVE,
    MORGUE,
    BARRACKS,
    ZOO,
    TEMPLE,
    LEPREHALL,
    COCKNEST,
    ANTHOLE,
    SHOPBASE,
    ARMORSHOP,
    SCROLLSHOP,
    POTIONSHOP,
    WEAPONSHOP,
    FOODSHOP,
    RINGSHOP,
    WANDSHOP,
    TOOLSHOP,
    BOOKSHOP,
    FODDERSHOP,
    CANDLESHOP,
    ROOMOFFSET,
    MAXNROFROOMS,
    MAX_NESTED_ROOMS,
    SCORR,
    IRONBARS,
    FOUNTAIN,
    SINK,
    THRONE,
    TREE,
    DUST,
    ENGRAVE,
    BURN,
    ENGR_BLOOD,
    IS_STWALL,
    IS_DOOR,
    IS_ROOM,
    IS_OBSTRUCTED,
    IS_FURNITURE,
    IS_POOL,
    IS_LAVA,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    W_RANDOM,
    W_NORTH,
    W_SOUTH,
    W_EAST,
    W_WEST,
    W_ANY,
    FILL_NONE,
    FILL_NORMAL,
    ICE,
    MOAT,
    POOL,
    ICED_POOL,
    ICED_MOAT,
    CLOUD,
    GRAVE,
    ACCESSIBLE,
    MAX_TYPE,
    MATCH_WALL,
    ALTAR,
    DELPHI,
    LR_BRANCH,
    LR_DOWNSTAIR,
    LR_PORTAL,
    LR_UPSTAIR,
    LR_TELE,
    LR_UPTELE,
    LR_DOWNTELE,
    LR_MONGEN,
    MALE,
    NO_TRAP,
    ARROW_TRAP,
    DART_TRAP,
    ROCKTRAP,
    SQKY_BOARD,
    BEAR_TRAP,
    LANDMINE,
    SLP_GAS_TRAP,
    RUST_TRAP,
    FIRE_TRAP,
    PIT,
    SPIKED_PIT,
    HOLE,
    TRAPDOOR,
    TELEP_TRAP,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    WEB,
    STATUE_TRAP,
    MAGIC_TRAP,
    ANTI_MAGIC,
    POLY_TRAP,
    VIBRATING_SQUARE,
    SET_LIT_NOCHANGE,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOSPIDERONWEB,
    MKTRAP_NOVICTIM,
    MKTRAP_SEEN,
    CORPSTAT_NONE,
    MARK,
    MM_NOGRP,
    NO_MM_FLAGS,
    AM_SHRINE,
    AM_SANCTUM,
    Is_medusa_level,
    TRAPNUM,
    In_endgame,
    is_hole,
    undestroyable_trap,
    ANY_LOC,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    AM_NONE,
    AM_SPLEV_CO,
    AM_SPLEV_NONCO,
    AM_SPLEV_RANDOM,
    BOOL_RANDOM,
    CUSTOM_INVENT,
    DEFAULT_INVENT,
    FEMALE,
    INVALID_TYPE,
    IS_DOORJOIN,
    IS_TREE,
    LVLINIT_MAZE,
    LVLINIT_MAZEGRID,
    LVLINIT_MINES,
    LVLINIT_NONE,
    LVLINIT_ROGUE,
    LVLINIT_SOLIDFILL,
    LVLINIT_SWAMP,
    MAP_Y_LIM,
    MM_ADJACENTOK,
    MM_IGNOREWATER,
    MM_NOCOUNTBIRTH,
    MM_NOTAIL,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_OBJECT,
    NEUTRAL,
    NON_PM,
    NO_INVENT,
    NO_LOC_WARN,
    SP_COORD_IS_RANDOM,
    SP_COORD_PACK,
    SP_COORD_PACK_RANDOM,
    F_LOOTED,
    F_WARNED,
    S_LPUDDING,
    S_LDWASHER,
    S_LRING,
    T_LOOTED,
    TREE_LOOTED,
    TREE_SWARM,
} from './const.js';
import {
    G_IGNORE,
    G_NOGEN,
    LOW_PM,
    MR_STONE,
    NUMMONS,
    PM_MINOTAUR,
} from './monsters.js';
import { create_drawbridge } from './dbridge.js';
import {
    on_level,
    Can_dig_down,
    Can_fall_thru,
    In_hell,
    In_W_tower_steps,
    depth,
    find_level,
    mapseen_room,
    ROOM_INDEX,
} from './dungeon.js';
import { placebc, unplacebc_async } from './ball.js';
import {
    BOULDER,
    CORPSE,
    EGG,
    FIGURINE,
    TIN,
    GEM_CLASS,
    MAXOCLASSES,
    NUM_OBJECTS,
    OBJ_DESCR,
    OBJ_NAME,
    POTION_CLASS,
    RANDOM_CLASS,
    RIN_TELEPORTATION,
    RING_CLASS,
    SCROLL_CLASS,
    SCR_TELEPORTATION,
    SPBOOK_CLASS,
    STATUE,
    STRANGE_OBJECT,
    WAN_DIGGING,
    WAN_TELEPORTATION,
    WAND_CLASS,
    PICK_AXE,
    DWARVISH_MATTOCK,
    getObjects,
} from './objects.js';
import {
    back_to_glyph,
    glyph_is_cmap,
    set_wall_state,
    swap_levl_entries,
} from './display.js';
import { def_char_to_monclass, def_char_to_objclass } from './drawing.js';
import { coreRandom, rn2, rnd, rn1 } from './rng.js';
import { printQueued } from './tty_message.js';
import { vision_reset } from './vision.js';
import { impossible, impossible_printer } from './pline.js';
import {
    ImpossibleCall,
    finish_steps,
    sync_impossible,
} from './source_steps.js';
import { del_engr_at, engr_at, make_engr_at } from './engrave.js';
import { create_gas_cloud, create_gas_cloud_selection } from './region.js';
import {
    is_female,
    is_male,
    name_to_monplus,
    pm_resistance,
    poly_when_stoned,
} from './mondata.js';
import { obj_extract_self, obfree, sobj_at } from './invent.js';
import { makemon_by_context } from './makemon_create.js';
import {
    get_table_boolean_opt,
    get_table_int,
    get_table_int_opt,
    get_table_option,
    get_table_str,
    get_table_str_opt,
    lcheck_param_table,
    lua_tointeger,
    luaL_checkinteger,
    luaL_checkoption,
    luaL_checkstring,
    luaL_typename,
    nhl_call_field,
    nhl_error,
    nhl_loadlua,
    nhl_pcall_handle,
    nhlL_newstate,
} from './nhlua.js';
import {
    objectGenerationEnv,
    objectGenerationHooks,
} from './object_generation.js';
import { oinit } from './o_init.js';
import { MAXMCLASSES } from './symbols.js';
import { carried, mkgold, mkobj_at, mksobj_at, set_corpsenm } from './mkobj.js';
import { mkcorpstat } from './corpstat.js';
import { priestini } from './priest.js';
import { mkclass, rndmonnum } from './makemon.js';
import { goodpos } from './teleport.js';
import { stairway_add } from './stairs.js';
import { stock_room } from './shknam.js';
import { in_rooms } from './rooms.js';
import { fill_zoo, mk_tt_object } from './mkroom.js';
import {
    fix_wall_spines,
    levelObjectEnv,
    shuffle_core_values,
    clear_level_structures,
    litstate_rnd,
    splev_chr2typ,
    check_mapchr,
    get_table_mapchr,
    get_table_mapchr_opt,
    pick_vibrasquare_location,
    runLevelLoader,
    flood_fill_rm,
    mkmap_steps,
    walkfrom,
    add_room,
    add_subroom,
    topologize,
    maybe_sdoor,
    add_door,
    okdoor,
    makecorridors,
    mkstairs,
    premap_detect,
    wallification,
    level_finalize_topology,
} from './mklev.js';
import { mineralize } from './mineralize.js';
import { make_grave } from './grave.js';
import { count_level_features, set_levltyp } from './terrain.js';
import { deltrap, maketrap, t_at } from './trap.js';
import { flip_worm_segs_horizontal, flip_worm_segs_vertical } from './worm.js';
import {
    get_level_extends,
    create_maze,
    fixup_special,
    set_levltyp_lit,
} from './mkmaze.js';
import { mktrap as make_level_trap } from './mktrap.js';
import { rnd_rect, get_rect, split_rects } from './rect.js';
import { l_selection_setpoint } from './nhlsel.js';
import {
    get_free_room_loc,
    get_location,
    get_location_coord,
    inside_room,
    is_ok_location,
    set_ok_location_func,
    somex,
    somey,
} from './room_coordinates.js';
import {
    selection_floodfill,
    selection_clear,
    selection_iterate,
    selection_new,
    set_selection_floodfillchk,
    ThemeroomSelection,
} from './themerooms.js';
// room_features.js and themeroom_data.js are imported for evaluation
// order only. mklev.js enters sp_lev.js before either of them, so
// sp_lev.js loads them where mklev.js's import list places them, and
// every module evaluates in the order that list gives.
import './room_features.js';
import { lspo_object, new_sp_lev_object_context } from './sp_lev_object.js';
import {
    create_monster,
    sp_amask_to_amask,
    spo_end_moninvent,
} from './themeroom_fill.js';
// Evaluation order only; see room_features.js above.
import './themeroom_data.js';
import { makeroguerooms } from './extralev.js';

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
        if (!ballFlipArea) await unplacebc_async(state);
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
            if (flp & 1) flip_worm_segs_vertical(mtmp, miny, maxy, state);
            if (flp & 2) flip_worm_segs_horizontal(mtmp, minx, maxx, state);
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
    // monster grid, turning drawbridges to face the other way first. The
    // screen state on each location stays put; see swap_levl_entries().
    if (flp & 1) {
        for (let x = minx; x <= maxx; x++) {
            const half = miny + Math.trunc((maxy - miny + 1) / 2);
            for (let y = miny; y < half; y++) {
                const ny = FlipY(y);

                flip_dbridge_vertical(level.locations[x][y]);
                flip_dbridge_vertical(level.locations[x][ny]);

                swap_levl_entries(level, x, y, x, ny);
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

                swap_levl_entries(level, x, y, nx, y);
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
    const random = env.random ?? coreRandom;
    let c = 0;
    if ((flp & 1) && random.rn2(2)) c |= 1;
    if ((flp & 2) && random.rn2(2)) c |= 2;
    if (c) await flip_level(c, extras, state);
}

// sp_lev.c room alignment values are private to that loader. The source
// names the vertical pair TOP and BOTTOM.
const SPLEV_LEFT = 1;
const SPLEV_H_LEFT = SPLEV_LEFT + 1;
const SPLEV_CENTER = SPLEV_H_LEFT + 1;
const SPLEV_H_RIGHT = SPLEV_CENTER + 1;
const SPLEV_RIGHT = SPLEV_H_RIGHT + 1;
const SPLEV_TOP = 1;
const SPLEV_BOTTOM = 5;

// C ref: sp_lev.c fill_special_room(). Shops are backed by stock_room(); the
// selected ordinary D:5 special-room family is backed by mkroom.c fill_zoo().
export function fill_special_room(croom, env = {}) {
    if (!croom) return;

    const state = env.state ?? game;
    // C can fill rooms from lspo_finalize_level() after level_finalize_topology
    // has cleared in_mklev.  Preserve that state while identifying this
    // internal level-generation call for makemon's admission gate.
    const normalized = { ...env, state, _specialRoomFill: true };
    const randomOneBased = env.random?.rn1 ?? rn1;
    const subrooms = croom.sbrooms ?? [];
    const subroomCount = croom.nsubrooms ?? subrooms.length;
    const finishOwnRoom = () => {
        if (croom.rtype === OROOM || croom.rtype === THEMEROOM
            || croom.needfill === FILL_NONE) {
            return;
        }

        const flags = state.level?.flags;
        if (!flags)
            throw new Error('fill_special_room requires initialized level flags');

        if (croom.needfill === FILL_NORMAL) {
            if (croom.rtype >= SHOPBASE) {
                const stockRoom = env.stockRoom ?? stock_room;
                const maybeStocked = stockRoom(
                    croom.rtype - SHOPBASE, croom, normalized,
                );
                const finishShop = () => {
                    flags.has_shop = true;
                };
                if (maybeStocked && typeof maybeStocked.then === 'function')
                    return maybeStocked.then(finishShop);
                finishShop();
                return;
            }

            switch (croom.rtype) {
            case VAULT: {
                const amountRange = Math.abs(depth(state.u?.uz, state)) * 100;
                for (let x = croom.lx; x <= croom.hx; ++x) {
                    for (let y = croom.ly; y <= croom.hy; ++y) {
                        mkgold(randomOneBased(amountRange, 51), x, y, normalized);
                    }
                }
                break;
            }
            case COURT:
            case BEEHIVE:
            case MORGUE:
            case BARRACKS:
            case ZOO: {
                const maybeFill = fill_zoo(croom, normalized);
                if (maybeFill && typeof maybeFill.then === 'function')
                    return maybeFill.then(() => finishFlags());
                break;
            }
            case ANTHOLE:
            case COCKNEST:
            case LEPREHALL: {
                const maybeFill = fill_zoo(croom, normalized);
                if (maybeFill && typeof maybeFill.then === 'function')
                    return maybeFill.then(() => finishFlags());
                break;
            }
            default:
                break;
            }
        }

        return finishFlags();
    };

    const finishFlags = () => {
        const flags = state.level?.flags;
        if (!flags)
            throw new Error('fill_special_room requires initialized level flags');
        switch (croom.rtype) {
        case VAULT:
            flags.has_vault = true;
            break;
        case ZOO:
            flags.has_zoo = true;
            break;
        case COURT:
            flags.has_court = true;
            break;
        case MORGUE:
            flags.has_morgue = true;
            break;
        case BEEHIVE:
            flags.has_beehive = true;
            break;
        case BARRACKS:
            flags.has_barracks = true;
            break;
        case TEMPLE:
            flags.has_temple = true;
            break;
        case SWAMP:
            flags.has_swamp = true;
            break;
        default:
            break;
        }
    };

    const visitSubrooms = (index) => {
        while (index < subroomCount) {
            const maybeSubroom = fill_special_room(subrooms[index], normalized);
            ++index;
            if (maybeSubroom && typeof maybeSubroom.then === 'function')
                return maybeSubroom.then(() => visitSubrooms(index));
        }
        return finishOwnRoom();
    };

    return visitSubrooms(0);
}

export function roomIsFillable(croom) {
    return Boolean(croom
        && (croom.rtype === OROOM || croom.rtype === THEMEROOM)
        && croom.needfill === FILL_NORMAL);
}

// These descriptor consumers copy through C strlen/dupstr. Keep this local:
// Lua strings themselves may contain NUL bytes in other supported operations.
function cStringPrefix(text) {
    const end = text.indexOf('\0');
    return end < 0 ? text : text.slice(0, end);
}

// C ref: sp_lev.c mapfrag_fromstr(). Parses a mapfragment string into the
// source's record: the digit-stripped text, the widest line, and the line
// count. Returns null past MAP_Y_LIM lines. The text is kept as one string
// because mapfrag_get() indexes it the way the source does.
export function mapfrag_fromstr(str) {
    const mf = {};

    mf.data = stripdigits(cStringPrefix(str));
    mf.wid = str_lines_maxlen(mf.data);
    mf.hei = 0;
    let tmps = 0;
    while (tmps !== null && tmps < mf.data.length) {
        let s1 = mf.data.indexOf('\n', tmps);

        if (mf.hei > MAP_Y_LIM)
            return null;
        if (s1 >= 0)
            s1++;
        tmps = s1 >= 0 ? s1 : null;
        mf.hei++;
    }
    return mf;
}

// C ref: sp_lev.c mapfrag_free(). Releases the fragment's text; the record
// itself is garbage collected.
export function mapfrag_free(mf) {
    if (mf) {
        mf.data = null;
    }
}

// C ref: sp_lev.c mapfrag_get(). Reads the terrain at (x, y) of the fragment.
// Each line is assumed to be `wid` wide plus its newline, as in the source.
export function mapfrag_get(mf, x, y) {
    if (y < 0 || x < 0 || y > mf.hei - 1 || x > mf.wid - 1)
        throw new Error(`outside mapfrag (${mf.wid},${mf.hei}), wanted (${x},${y})`);
    return splev_chr2typ(mf.data[y * (mf.wid + 1) + x]);
}

// C ref: sp_lev.c mapfrag_canmatch(). A pattern needs odd dimensions so it
// has a center cell.
export function mapfrag_canmatch(mf) {
    return Boolean((mf.wid % 2) && (mf.hei % 2));
}

// C ref: sp_lev.c TYP_CANNOT_MATCH(). A transparent (MAX_TYPE) or invalid
// fragment center cannot anchor a match; MATCH_WALL can.
function TYP_CANNOT_MATCH(typ) {
    return typ === MAX_TYPE || typ === INVALID_TYPE;
}

// C ref: sp_lev.c mapfrag_error(). The message a caller reports for an
// unusable fragment, or null when the fragment can be matched.
export function mapfrag_error(mf) {
    let res = null;

    if (!mf) {
        res = 'mapfragment error';
    } else if (!mapfrag_canmatch(mf)) {
        mapfrag_free(mf);
        res = 'mapfragment needs to have odd height and width';
    } else if (TYP_CANNOT_MATCH(mapfrag_get(mf, Math.trunc(mf.wid / 2),
                                            Math.trunc(mf.hei / 2)))) {
        mapfrag_free(mf);
        res = 'mapfragment center must be valid terrain';
    }
    return res;
}

// C ref: sp_lev.c match_maptyps(). MATCH_WALL matches any stone wall;
// MAX_TYPE (transparency) matches anything.
function match_maptyps(mapc, levltyp) {
    if (mapc === MATCH_WALL && !IS_STWALL(levltyp)) return false;
    if (mapc < MAX_TYPE && mapc !== levltyp) return false;
    return true;
}

// C ref: sp_lev.c mapfrag_match(). Matches the pattern centered on (x, y);
// cells off the map count as STONE.
export function mapfrag_match(mf, x, y, state = game) {
    const halfw = Math.trunc(mf.wid / 2);
    const halfh = Math.trunc(mf.hei / 2);
    for (let rx = -halfw; rx <= halfw; rx++)
        for (let ry = -halfh; ry <= halfh; ry++) {
            const mapc = mapfrag_get(mf, rx + halfw, ry + halfh);
            const levc = isok(x + rx, y + ry)
                ? state.level.at(x + rx, y + ry).typ : STONE;

            if (!match_maptyps(mapc, levc))
                return false;
        }
    return true;
}

function themeroom_map_fits(definition, xstart, ystart, state) {
    const { width, height, map: rows } = definition;
    for (let y = ystart - 1; y < Math.min(ROWNO, ystart + height) + 1; y++) {
        for (let x = xstart - 1; x < Math.min(COLNO, xstart + width) + 1; x++) {
            if (!isok(x, y)) return false;
            const inside = y >= ystart && y < ystart + height
                && x >= xstart && x < xstart + width;
            const loc = state.level.at(x, y);
            if (!inside) {
                if (!loc || loc.typ !== STONE || loc.roomno !== 0) return false;
                continue;
            }
            const mapType = splev_chr2typ(rows[y - ystart][x - xstart]);
            if (mapType >= MAX_TYPE) continue;
            if (!loc || (loc.typ !== STONE && loc.typ !== mapType) || loc.roomno !== 0)
                return false;
        }
    }
    return true;
}

// C ref: sp_lev.c sel_set_ter(), as called by lspo_map(). Map loading clears
// the location metadata before setting terrain. The map's default lit=false
// still leaves lava lit, and door orientation depends on the already-loaded
// cell immediately to its left.
function set_themeroom_map_terrain(x, y, typ, state, lit = 0, frame = null) {
    const loc = state.level.at(x, y);
    // sp_lev.c lspo_map() clears rm.flags, which wall_info overlays, before
    // calling sel_set_ter().
    loc.flags = 0;
    loc.horizontal = false;
    loc.roomno = 0;
    loc.edge = false;
    if (!set_levltyp_lit(x, y, typ, lit, state)) return;

    if (typ === SDOOR || IS_DOOR(typ)) {
        if (typ === SDOOR) loc.flags = D_CLOSED;
        const left = x ? state.level.at(x - 1, y) : null;
        if (left && (IS_WALL(left.typ) || left.horizontal))
            loc.horizontal = true;
    } else if (typ === HWALL || typ === IRONBARS) {
        loc.horizontal = true;
    } else if (frame?.splev_init_present && typ === ICE) {
        loc.flags = frame.icedpools ? ICED_POOL : ICED_MOAT;
    } else if (typ === CLOUD) {
        del_engr_at(x, y, state);
    }
}

// C ref: sp_lev.c sel_set_ter(), which calls mkmaze.c set_levltyp_lit() and
// then fixes up the door, wall, ice, and cloud arms. This is the special-level
// API's terrain() writer; set_themeroom_map_terrain() above is the same
// function as called by lspo_map(), whose metadata reset differs. The ice arm
// records the coder's icedpools choice only while a special level is being
// initialized. The cloud arm clears engravings after the terrain write.
function sel_set_ter(x, y, typ, lit, state, frame, random = rn2) {
    if (!set_levltyp_lit(x, y, typ, lit, state, random)) return false;
    const location = state.level.at(x, y);
    const actualType = location.typ;
    if (actualType === SDOOR || IS_DOOR(actualType)) {
        // A wall's flags (its wall_info) stay as an ordinary door's mask.
        if (actualType === SDOOR) location.flags = D_CLOSED;
        const left = x > 0 ? state.level.at(x - 1, y) : null;
        if (left && (IS_WALL(left.typ) || left.horizontal))
            location.horizontal = true;
    } else if (actualType === HWALL || actualType === IRONBARS) {
        location.horizontal = true;
    } else if (frame?.splev_init_present && actualType === ICE) {
        location.flags = frame.icedpools ? ICED_POOL : ICED_MOAT;
    } else if (actualType === CLOUD) {
        del_engr_at(x, y, state);
    }
    return true;
}

// C ref: sp_lev.c sel_set_wall_property(). Flags one wall, tree, or iron
// bars square with a W_NONDIGGABLE/W_NONPASSWALL property; other terrain is
// left alone. selection_iterate() and set_wall_property() call it per square.
function sel_set_wall_property(x, y, prop, state = game) {
    const loc = state.level.at(x, y);
    if (IS_STWALL(loc.typ) || IS_TREE(loc.typ, state)
        /* 3.6.2: made iron bars eligible to be flagged nondiggable
           (checked by chewing(hack.c) and zap_over_floor(zap.c)) */
        || loc.typ === IRONBARS)
        loc.flags |= prop;
}

// C ref: sp_lev.c set_wall_property(). Makes the walls of the area
// (x1, y1, x2, y2) non diggable/non passwall-able, clamped to the map.
function set_wall_property(x1, y1, x2, y2, prop, state = game) {
    x1 = Math.max(x1, 1);
    x2 = Math.min(x2, COLNO - 1);
    y1 = Math.max(y1, 0);
    y2 = Math.min(y2, ROWNO - 1);
    for (let y = y1; y <= y2; y++)
        for (let x = x1; x <= x2; x++) {
            sel_set_wall_property(x, y, prop, state);
        }
}

// C ref: sp_lev.c remove_boundary_syms(). CROSSWALLs mark "invisible"
// boundaries where door symbols look bad; once regions are laid out, the
// ones the map placed become ROOM.
function remove_boundary_syms(frame, state = game) {
    let has_bounds = false;

    for (let x = 0; x < COLNO - 1; x++)
        for (let y = 0; y < ROWNO - 1; y++)
            if (state.level.at(x, y).typ === CROSSWALL) {
                has_bounds = true;
                break;
            }
    if (has_bounds) {
        for (let x = 0; x < frame.xMazeMax; x++)
            for (let y = 0; y < frame.yMazeMax; y++)
                if ((state.level.at(x, y).typ === CROSSWALL)
                    && frame.splevMap[x][y])
                    state.level.at(x, y).typ = ROOM;
    }
}

// C ref: sp_lev.c set_door_orientation(), used by sel_set_door() and
// link_doors_rooms(). A door with a wall or door on its left or right is
// horizontal; with none adjacent, solid rock that has not been wallified yet
// (and the map edge) counts as an implicit wall.
function set_door_orientation(x, y, state = game) {
    const typAt = (xx, yy) => state.level.at(xx, yy).typ;
    const isDoorWall = (xx, yy) => isok(xx, yy)
        && (IS_WALL(typAt(xx, yy)) || IS_DOOR(typAt(xx, yy))
            || typAt(xx, yy) === SDOOR);
    let wleft = isDoorWall(x - 1, y);
    let wright = isDoorWall(x + 1, y);
    let wup = isDoorWall(x, y - 1);
    let wdown = isDoorWall(x, y + 1);
    if (!wleft && !wright && !wup && !wdown) {
        wleft = (!isok(x - 1, y) || IS_DOORJOIN(typAt(x - 1, y)));
        wright = (!isok(x + 1, y) || IS_DOORJOIN(typAt(x + 1, y)));
        wup = (!isok(x, y - 1) || IS_DOORJOIN(typAt(x, y - 1)));
        wdown = (!isok(x, y + 1) || IS_DOORJOIN(typAt(x, y + 1)));
    }
    state.level.at(x, y).horizontal = ((wleft || wright) && !(wup && wdown));
}

// C ref: sp_lev.c create_trap(). Resolves the trap's location (the
// vibrating square has its own picker; a room uses get_free_room_loc(); the
// map retries up to 100 times to avoid stairs and ladders), then hands the
// MKTRAP_ flags and the square to mktrap().
// Copies: sp_lev.c create_trap() is also ported as themeroom_fill.js
// createRoomTrap() and themeroom_fill.js createPostprocessTrap(). A change to
// it must reach every copy.
function create_trap(t, croom, frame, env) {
    const { state } = env;
    const tm = { x: -1, y: -1 };
    let mktrap_flags = MKTRAP_MAZEFLAG;

    if (t.type === VIBRATING_SQUARE) {
        state.inv_pos = pick_vibrasquare_location(frame, state);
        maketrap(state.inv_pos.x, state.inv_pos.y, VIBRATING_SQUARE, env);
        return;
    } else if (croom) {
        get_free_room_loc(tm, croom, t.coord, { frame, state });
    } else {
        let trycnt = 0;

        do {
            get_location_coord(tm, DRY, croom, t.coord, { frame, state });
        } while ((state.level.at(tm.x, tm.y).typ === STAIRS
                  || state.level.at(tm.x, tm.y).typ === LADDER)
                 && ++trycnt <= 100);
        if (trycnt > 100)
            return;
    }

    if (!t.spider_on_web)
        mktrap_flags |= MKTRAP_NOSPIDERONWEB;
    if (t.seen)
        mktrap_flags |= MKTRAP_SEEN;
    if (t.novictim)
        mktrap_flags |= MKTRAP_NOVICTIM;

    return make_level_trap(t.type, mktrap_flags, null, tm, env);
}

// C ref: sp_lev.c good_stair_loc(). The is_ok_location_func that
// l_create_stairway() installs while it picks a random square.
function good_stair_loc(x, y, state = game) {
    const typ = state.level.at(x, y).typ;

    return (typ === ROOM || typ === CORR || typ === ICE);
}

// C ref: sp_lev.c get_table_align(). The "align" option of an altar or
// monster table; its default is "random".
function get_table_align(spec) {
    const aligns2i = {
        noalign: AM_NONE, law: AM_LAWFUL, neutral: AM_NEUTRAL,
        chaos: AM_CHAOTIC, coaligned: AM_SPLEV_CO,
        noncoaligned: AM_SPLEV_NONCO, random: AM_SPLEV_RANDOM,
    };
    const a = aligns2i[spec.align ?? 'random'];
    if (a == null)
        throw new Error(`unknown special-level alignment ${spec.align}`);
    return a;
}

// C ref: sp_lev.c create_altar(). Places an altar at the resolved square,
// stores its alignment mask, and for a shrine or sanctum inside a temple
// installs the priest and marks the level as having a temple.
function create_altar(a, croom, frame, env) {
    const { state } = env;
    const c = { x: -1, y: -1 };
    let croom_is_temple = true;

    if (croom) {
        get_free_room_loc(c, croom, a.coord, { frame, state });
        if (croom.rtype !== TEMPLE)
            croom_is_temple = false;
    } else {
        get_location_coord(c, DRY, croom, a.coord, { frame, state });
        const sprooms = in_rooms(c.x, c.y, TEMPLE, state);
        if (sprooms.length > 0)
            croom = mapseen_room(sprooms[0] - ROOMOFFSET, state);
        else
            croom_is_temple = false;
    }
    const { x, y } = c;

    /* check for existing features */
    if (!set_levltyp(x, y, ALTAR, { state }))
        return;

    const amask = sp_amask_to_amask(a.sp_amask, env);

    // struct rm's altarmask aliases its flags field.
    const loc = state.level.at(x, y);
    loc.flags = amask;

    if (a.shrine < 0)
        a.shrine = rn2(2); /* handle random case */

    if (!croom_is_temple || !a.shrine)
        return;

    if (a.shrine) { /* Is it a shrine  or sanctum? */
        const finishShrine = () => {
            loc.flags |= AM_SHRINE;
            if (a.shrine === 2) /* high altar or sanctum */
                loc.flags |= AM_SANCTUM;
            state.level.flags.has_temple = true;
        };
        // A Promise when a level program that #wizloadlua runs makes the
        // priest outside level creation (priestini()).
        const made = priestini(state.u.uz, croom, x, y, (a.shrine > 1), env);
        return made && typeof made.then === 'function'
            ? made.then(finishShrine) : finishShrine();
    }
}

// C ref: sp_lev.c search_door(). Searches for the cnt'th door in a room on
// the specified wall; returns its square, or null when there are fewer.
export function search_door(croom, wall, cnt, state = game) {
    let dx, dy;
    let xx, yy;

    switch (wall) {
    case W_SOUTH:
        dy = 0;
        dx = 1;
        xx = croom.lx;
        yy = croom.hy + 1;
        break;
    case W_NORTH:
        dy = 0;
        dx = 1;
        xx = croom.lx;
        yy = croom.ly - 1;
        break;
    case W_EAST:
        dy = 1;
        dx = 0;
        xx = croom.hx + 1;
        yy = croom.ly;
        break;
    case W_WEST:
        dy = 1;
        dx = 0;
        xx = croom.lx - 1;
        yy = croom.ly;
        break;
    default:
        throw new Error('search_door: Bad wall!');
    }
    while (xx <= croom.hx + 1 && yy <= croom.hy + 1) {
        const typ = state.level.at(xx, yy).typ;
        if (IS_DOOR(typ) || typ === SDOOR) {
            if (cnt-- <= 0)
                return { x: xx, y: yy };
        }
        xx += dx;
        yy += dy;
    }
    return null;
}

// C ref: sp_lev.c create_corridor(). A source room of -1 asks for the
// ordinary makecorridors(); otherwise the corridor runs from the door on
// the source wall to the door on the destination wall, each stepped one
// square outward from its wall. Returns makecorridors()'s Promise when it
// waits.
function create_corridor(c, state = game) {
    if (c.src.room === -1) {
        return makecorridors(); /*makecorridors(c->src.door);*/
    }

    /* Safety railings - if there's ever a case where des.corridor() needs
     * to be called with src/destwall="random", that logic first needs to be
     * implemented in search_door. */
    if (c.src.wall === W_ANY || c.src.wall === W_RANDOM
        || c.dest.wall === W_ANY || c.dest.wall === W_RANDOM) {
        // C: impossible("create_corridor to/from a random wall");
        sync_impossible('create_corridor to/from a random wall', state);
        return;
    }
    const org = search_door(state.level.rooms[c.src.room], c.src.wall,
                            c.src.door, state);
    if (!org)
        return;
    if (c.dest.room !== -1) {
        const dest = search_door(state.level.rooms[c.dest.room],
                                 c.dest.wall, c.dest.door, state);
        if (!dest)
            return;
        switch (c.src.wall) {
        case W_NORTH:
            org.y--;
            break;
        case W_SOUTH:
            org.y++;
            break;
        case W_WEST:
            org.x--;
            break;
        case W_EAST:
            org.x++;
            break;
        }
        switch (c.dest.wall) {
        case W_NORTH:
            dest.y--;
            break;
        case W_SOUTH:
            dest.y++;
            break;
        case W_WEST:
            dest.x--;
            break;
        case W_EAST:
            dest.x++;
            break;
        }
        dig_corridor(org, dest, null, false, CORR, STONE);
    }
}

// C ref: sp_lev.c light_region(). Sets the lighting of a rectangular
// region; a lit region grows by one square so its walls are lit too, and
// lava stays lit either way.
function light_region(tmpregion, state = game) {
    const litstate = tmpregion.rlit ? 1 : 0;
    let hiy = tmpregion.y2;
    let lowy = tmpregion.y1;
    let lowx = tmpregion.x1, hix = tmpregion.x2;

    if (litstate) {
        /* adjust region size for walls, but only if lighted */
        lowx = Math.max(lowx - 1, 1);
        hix = Math.min(hix + 1, COLNO - 1);
        lowy = Math.max(lowy - 1, 0);
        hiy = Math.min(hiy + 1, ROWNO - 1);
    }
    for (let x = lowx; x <= hix; x++) {
        for (let y = lowy; y <= hiy; y++) {
            const lev = state.level.at(x, y);
            lev.lit = IS_LAVA(lev.typ) ? true : Boolean(litstate);
        }
    }
}

// C ref: sp_lev.c lvlfill_maze_grid(). Writes the maze grid's terrain
// directly: STONE on the top two rows and at odd-odd cells, `filling`
// elsewhere; a corridor maze is all STONE.
function lvlfill_maze_grid(x1, y1, x2, y2, filling, state) {
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
            if (state.level.flags.corrmaze)
                state.level.at(x, y).typ = STONE;
            else
                state.level.at(x, y).typ = (y < 2 || ((x % 2) && (y % 2)))
                    ? STONE : filling;
        }
}

// C ref: sp_lev.c lvlfill_solid(). Fills the maze area with one terrain and
// lighting, clearing each written cell's door, room, and edge metadata.
function lvlfill_solid(filling, lit, frame, state) {
    for (let x = 2; x <= frame.xMazeMax; x++)
        for (let y = 0; y <= frame.yMazeMax; y++) {
            if (!set_levltyp_lit(x, y, filling, lit, state))
                continue;
            const loc = state.level.at(x, y);
            loc.flags = 0;
            loc.horizontal = false;
            loc.roomno = 0;
            loc.edge = false;
        }
}

// C ref: sp_lev.c lvlfill_swamp(). Jamis Buck's "relaxed blockwise maze":
// over a solid `bg` fill, every even cell becomes `fg`, and where the three
// cells below and to the right of it are all still `bg`, rn2(3) picks one of
// them to become `fg` too.
function lvlfill_swamp(fg, bg, lit, frame, state) {
    lvlfill_solid(bg, lit, frame, state);

    for (let x = 2; x <= Math.min(frame.xMazeMax, COLNO - 2); x += 2)
        for (let y = 0; y <= Math.min(frame.yMazeMax, ROWNO - 2); y += 2) {
            let c = 0;

            set_levltyp_lit(x, y, fg, lit, state);
            if (state.level.at(x + 1, y).typ === bg)
                ++c;
            if (state.level.at(x, y + 1).typ === bg)
                ++c;
            if (state.level.at(x + 1, y + 1).typ === bg)
                ++c;
            if (c === 3) {
                switch (rn2(3)) {
                case 0:
                    set_levltyp_lit(x + 1, y, fg, lit, state);
                    break;
                case 1:
                    set_levltyp_lit(x, y + 1, fg, lit, state);
                    break;
                case 2:
                    set_levltyp_lit(x + 1, y + 1, fg, lit, state);
                    break;
                default:
                    break;
                }
            }
        }
}

// C ref: sp_lev.c splev_initlev(). Dispatches a des.level_init() request to
// the fill routine its style names. A step generator (js/source_steps.js):
// mkmap.c join_map() can print impossible() in the middle of the fill.
function* splev_initlev_steps(linit, frame, state) {
    switch (linit.init_style) {
    default:
        yield new ImpossibleCall('Unrecognized level init style.');
        break;
    case LVLINIT_NONE:
        break;
    case LVLINIT_SOLIDFILL:
        if (linit.lit === BOOL_RANDOM)
            linit.lit = rn2(2);
        lvlfill_solid(linit.filling, linit.lit, frame, state);
        break;
    case LVLINIT_MAZEGRID:
        lvlfill_maze_grid(2, 0, frame.xMazeMax, frame.yMazeMax, linit.bg,
                          state);
        break;
    case LVLINIT_MAZE:
        create_maze(linit.corrwid, linit.wallthick, linit.rm_deadends, frame,
                    state);
        break;
    case LVLINIT_ROGUE:
        // Rogue-style special level descriptions use the same procedural
        // generator as makelevel() and do not fill a rectangular map first.
        // The Lua path is not a caller in the selected production branch yet;
        // keep this dispatch source-shaped for future level definitions.
        makeroguerooms(state);
        break;
    case LVLINIT_MINES:
        if (linit.lit === BOOL_RANDOM)
            linit.lit = rn2(2);
        if (linit.filling > -1)
            lvlfill_solid(linit.filling, 0, frame, state);
        // C: the file-scope icedpools flag lspo_level_flags("icedpools")
        // sets; this port keeps it on the frame.
        linit.icedpools = frame.icedpools;
        yield* mkmap_steps(linit, state);
        break;
    case LVLINIT_SWAMP:
        if (linit.lit === BOOL_RANDOM)
            linit.lit = rn2(2);
        lvlfill_swamp(linit.fg, linit.bg, linit.lit, frame, state);
        break;
    }
}

// C ref: sp_lev.c sp_code_jmpaddr(). The source keeps it under `#if 0`
// with no caller; it is a relic of the pre-Lua bytecode interpreter.
export function sp_code_jmpaddr(curpos, jmpaddr) {
    return (curpos + jmpaddr);
}

// C ref: sp_lev.c l_push_wid_hei_table(). The table a des.map() contents
// callback receives: {width=wid, height=hei}.
export function l_push_wid_hei_table(wid, hei) {
    return { width: wid, height: hei };
}

// C ref: sp_lev.c room_types[] and get_mkroom_name(). The Lua name of a
// room type, "unknown" for one the table lacks.
const room_types = [
    ['ordinary', OROOM],
    ['themed', THEMEROOM],
    ['throne', COURT],
    ['swamp', SWAMP],
    ['vault', VAULT],
    ['beehive', BEEHIVE],
    ['morgue', MORGUE],
    ['barracks', BARRACKS],
    ['zoo', ZOO],
    ['delphi', DELPHI],
    ['temple', TEMPLE],
    ['anthole', ANTHOLE],
    ['cocknest', COCKNEST],
    ['leprehall', LEPREHALL],
    ['shop', SHOPBASE],
    ['armor shop', ARMORSHOP],
    ['scroll shop', SCROLLSHOP],
    ['potion shop', POTIONSHOP],
    ['weapon shop', WEAPONSHOP],
    ['food shop', FOODSHOP],
    ['ring shop', RINGSHOP],
    ['wand shop', WANDSHOP],
    ['tool shop', TOOLSHOP],
    ['book shop', BOOKSHOP],
    ['health food shop', FODDERSHOP],
    ['candle shop', CANDLESHOP],
];

export function get_mkroom_name(rtype) {
    for (const [name, type] of room_types)
        if (type === rtype)
            return name;

    // C: impossible("get_mkroom_name unknown rtype %d", rtype);
    sync_impossible(`get_mkroom_name unknown rtype ${rtype}`, game);
    return 'unknown'; /* not NULL */
}

// C ref: sp_lev.c l_push_mkroom_table(). The table a des.room() or
// des.region() contents callback receives, describing the room.
export function l_push_mkroom_table(tmpr) {
    return {
        width: 1 + (tmpr.hx - tmpr.lx),
        height: 1 + (tmpr.hy - tmpr.ly),
        region: { x1: tmpr.lx, y1: tmpr.ly, x2: tmpr.hx, y2: tmpr.hy },
        lit: Boolean(tmpr.rlit),
        irregular: Boolean(tmpr.irregular),
        needjoining: Boolean(tmpr.needjoining),
        type: get_mkroom_name(tmpr.rtype),
    };
}

// C ref: sp_lev.c, the lspo_* handlers a des-file calls. makelevel() builds one
// of these only when mklev() was given a specialLevelLoader, as tests do; the
// loader calls its methods the way the Lua files call des.*.
//
// scripts/tutorial-startup.test.mjs replays the tutorial loader against a
// recording stub and pins the level_init styles, level_flags names, and door
// states it supplies.

// Lazily populated on first use to avoid a circular import: bigrm.js
// imports splev_chr2typ from mklev.js, which imports this file, and this
// file imports BIGRM_LOADERS from bigrm.js. The dynamic import() in makemaz()
// resolves the cycle after both modules have finished evaluating.
export let SPECIAL_LEVEL_LOADERS = null;

// Lazy-loads all special level loader modules and populates
// SPECIAL_LEVEL_LOADERS. The dynamic import() breaks the circular
// dependency between this file and bigrm.js.
export async function ensureSpecialLevelLoaders() {
    if (SPECIAL_LEVEL_LOADERS) return;
    const { BIGRM_LOADERS } = await import('./bigrm.js');
    const { QUEST_LEVEL_LOADERS } = await import('./quest_levels.js');
    const { SOKOBAN_LEVEL_LOADERS } = await import('./sokoban_levels.js');
    const { CASTLE_LEVEL_LOADERS } = await import('./castle_levels.js');
    const { MINES_LEVEL_LOADERS } = await import('./mines_levels.js');
    const { FIRE_LEVEL_LOADERS } = await import('./fire_levels.js');
    const { AIR_LEVEL_LOADERS } = await import('./air_levels.js');
    const { EARTH_LEVEL_LOADERS } = await import('./earth_levels.js');
    const { WATER_LEVEL_LOADERS } = await import('./water_levels.js');
    const { HELL_LEVEL_LOADERS } = await import('./hell_levels.js');
    const { VALLEY_LEVEL_LOADERS } = await import('./valley_levels.js');
    const { MEDUSA_LEVEL_LOADERS } = await import('./medusa_levels.js');
    const { SANCTUM_LEVEL_LOADERS } = await import('./sanctum_levels.js');
    const { ASMODEUS_LEVEL_LOADERS } = await import('./asmodeus_levels.js');
    const { BAALZ_LEVEL_LOADERS } = await import('./baalz_levels.js');
    const { JUIBLEX_LEVEL_LOADERS } = await import('./juiblex_levels.js');
    const { ORCUS_LEVEL_LOADERS } = await import('./orcus_levels.js');
    const { WIZARD1_LEVEL_LOADERS } = await import('./wizard1_levels.js');
    const { WIZARD2_LEVEL_LOADERS } = await import('./wizard2_levels.js');
    const { FAKEWIZ2_LEVEL_LOADERS } = await import('./fakewiz2_level.js');
    const { WIZARD3_LEVEL_LOADERS } = await import('./wizard3_levels.js');
    const { FAKEWIZ1_LEVEL_LOADERS } = await import('./fakewiz1_levels.js');
    const { KNOX_LEVEL_LOADERS } = await import('./knox_levels.js');
    const { TUTORIAL_LEVEL_LOADERS } = await import('./tutorial_level.js');
    SPECIAL_LEVEL_LOADERS = {
        ...BIGRM_LOADERS,
        ...QUEST_LEVEL_LOADERS,
        ...SOKOBAN_LEVEL_LOADERS,
        ...CASTLE_LEVEL_LOADERS,
        ...MINES_LEVEL_LOADERS,
        ...FIRE_LEVEL_LOADERS,
        ...AIR_LEVEL_LOADERS,
        ...EARTH_LEVEL_LOADERS,
        ...WATER_LEVEL_LOADERS,
        ...HELL_LEVEL_LOADERS,
        ...VALLEY_LEVEL_LOADERS,
        ...MEDUSA_LEVEL_LOADERS,
        ...SANCTUM_LEVEL_LOADERS,
        ...ASMODEUS_LEVEL_LOADERS,
        ...BAALZ_LEVEL_LOADERS,
        ...JUIBLEX_LEVEL_LOADERS,
        ...ORCUS_LEVEL_LOADERS,
        ...WIZARD1_LEVEL_LOADERS,
        ...WIZARD2_LEVEL_LOADERS,
        ...FAKEWIZ2_LEVEL_LOADERS,
        ...WIZARD3_LEVEL_LOADERS,
        ...FAKEWIZ1_LEVEL_LOADERS,
        ...KNOX_LEVEL_LOADERS,
        ...TUTORIAL_LEVEL_LOADERS,
    };
    // Val-strt is the first translated level to use the Lua selection global.
    // Keep the established loader signature for every other level, including
    // loaders whose third argument is an injected random function.
    const valStrtLoader = QUEST_LEVEL_LOADERS['Val-strt'];
    SPECIAL_LEVEL_LOADERS['Val-strt'] = (des, state) =>
        valStrtLoader(des, state, des[SPECIAL_LEVEL_LUA_GLOBALS]);
}

// The names of every level program the port can load, for the check that
// they cover every level file in C's dat/ (scripts/special-level-loaders
// .test.mjs): makemaz() relies on it, as C's makemaz() relies on the
// install shipping every file dungeon.lua names.
export async function specialLevelLoaderNames() {
    await ensureSpecialLevelLoaders();
    return Object.keys(SPECIAL_LEVEL_LOADERS);
}

// C ref: sp_lev.c load_special(). Initializes the level coder, loads the
// named dat/ file through load_lua() (a level program runs through its
// loader, the JS form of its Lua), and applies post-processing. Returns false
// when the file cannot be loaded.
export async function load_special(name, state, callerEnv = null) {
    await ensureSpecialLevelLoaders();
    // C creates gc.coder before attempting load_lua(), or reuses the one a
    // #wizloadlua level program left. The file-scope SpLev_Map state stays
    // available to the caller's NULL-state finalizer even when the load
    // fails.
    create_des_coder(state);
    // C ref: nhlua.c load_lua(). nhl_init() loads nhlib.lua, which shuffles
    // the Lua state's private alignment table, before nhl_loadlua() opens
    // the file.
    const nud = nhlL_newstate(state);
    const align = ['law', 'neutral', 'chaos'];
    shuffle_core_values(align, rn2);
    const lua = { align, nud };
    const specialLevelApi = createSpecialLevelApi(state, lua);
    if (callerEnv) callerEnv.frame = specialLevelApi.frame;
    const loaded = await nhl_loadlua(lua, name, state);
    state.specialLevelAlign = lua.align;
    // A library file's top level leaves the coder as create_des_coder()
    // made it, and load_special() post-processes the current level as it is.
    // The port registers each level program under its name without ".lua";
    // nhl_loadlua() runs it in a protected call, and a Lua error prints
    // impossible() and fails the load.
    if (!loaded || (loaded.kind === 'level'
        && await nhl_pcall_handle(lua, () => runLevelLoader(name, loaded.file,
            lua, specialLevelApi, state), name, state))) {
        state.gc.coder = null; // C: give_up: Free(gc.coder)
        return false;
    }

    // Post-processing: finish() covers link_doors_rooms,
    // remove_boundary_syms, map_cleanup, wallification, flip_level_rnd,
    // count_level_features, solidify_map, fixup_special, premap_detect, and
    // fill_special_room. ensure_way_out (conditional on check_inaccessibles)
    // is recorded as a gap.
    await specialLevelApi.finish();

    return true;
}

// C ref: sp_lev.c lspo_map() halign/valign positioning. Translates
// alignment names to x/y offsets within the maze area.
function mapAlignX(halign, width, frame) {
    switch (halign) {
    // C: splev_init_present ? 1 : 3, the file-scope flag lspo_level_init()
    // sets; this port keeps it on the frame.
    case 'left': return frame.splev_init_present ? 1 : 3;
    case 'half-left': return 2 + Math.trunc((frame.xMazeMax - 2 - width) / 4);
    case 'center': return 2 + Math.trunc((frame.xMazeMax - 2 - width) / 2);
    case 'half-right':
        return 2 + Math.trunc(((frame.xMazeMax - 2 - width) * 3) / 4);
    case 'right': return frame.xMazeMax - width - 1;
    default: return 2 + Math.trunc((frame.xMazeMax - 2 - width) / 2);
    }
}

function mapAlignY(valign, height, frame) {
    switch (valign) {
    case 'top': return 3;
    case 'center': return 2 + Math.trunc((frame.yMazeMax - 2 - height) / 2);
    case 'bottom': return frame.yMazeMax - height - 1;
    default: return 2 + Math.trunc((frame.yMazeMax - 2 - height) / 2);
    }
}

// C ref: sp_lev.c update_croom(). Synchronizes coder->croom from the
// tmproomlist stack. After each room enter (n_subroom++) or exit
// (n_subroom--), croom points to the innermost active room, or null
// when at the top level.
function update_croom(coder) {
    if (!coder) return;
    if (coder.n_subroom) {
        coder.croom = coder.tmproomlist[coder.n_subroom - 1];
    } else {
        coder.croom = null;
    }
}

// C ref: sp_lev.c reset_xystart_size(). The map frame that get_location()
// converts Lua-relative coordinates through: column 0 is off limits, so the
// frame starts at (1, 0) and covers COLNO-1 by ROWNO. `frame`
// (sp_lev_frame()) holds C's gx.xstart/gy.ystart/gx.xsize/gy.ysize;
// state.xstart and friends mirror them for trap.js's launch offsets, and
// lspo_map() sets both the same way. clear_level_structures() calls this
// too; mklev.c's themed-room calls have no frame user in the port.
export function reset_xystart_size(frame, state) {
    frame.xstart = 1; /* column [0] is off limits */
    frame.ystart = 0;
    frame.xsize = COLNO - 1; /* 1..COLNO-1 */
    frame.ysize = ROWNO; /* 0..ROWNO-1 */
    state.xstart = frame.xstart;
    state.ystart = frame.ystart;
    state.xsize = frame.xsize;
    state.ysize = frame.ysize;
}

// C ref: sp_lev.c sp_level_coder_init(). Allocates and initializes the
// sp_coder structure, resets file-scope level-generation state, and sets
// default level flags. Returns the coder.
function sp_level_coder_init(state, frame) {
    const coder = {
        premapped: false,
        solidify: false,
        check_inaccessibles: false,
        allow_flips: 3,  // allow flipping level horiz/vert
        croom: null,
        n_subroom: 1,
        lvl_is_joined: false,
        room_stack: 0,
        tmproomlist: new Array(MAX_NESTED_ROOMS + 1).fill(null),
        failed_room: new Array(MAX_NESTED_ROOMS + 1).fill(false),
    };

    // C: splev_init_present = FALSE; icedpools = FALSE. Both are sp_lev.c
    // file-scope flags for one special-level load, so the frame holds them:
    // lspo_level_init() and lspo_level_flags() set them, and lspo_map(),
    // splev_initlev(), and sel_set_ter() read them.
    frame.splev_init_present = false;
    frame.icedpools = false;

    update_croom(coder);

    // C: container_obj[0..MAX_CONTAINMENT-1] = NULL; container_idx = 0;
    // invent_carrying_monster = NULL;
    // In JS these live in the sp_lev_object context, created separately.

    // C: memset(SpLev_Map, 0, sizeof SpLev_Map);
    for (const column of frame.splevMap) column.fill(0);

    // C: level.flags initialization
    state.level.flags.is_maze_lev = false;
    state.level.flags.temperature = In_hell(state.u.uz, state) ? 1 : 0;
    state.level.flags.rndmongen = true;
    state.level.flags.deathdrops = true;

    reset_xystart_size(frame, state);

    return coder;
}

// C ref: sp_lev.c nhl_functions[] / l_register_des(). In C, creates the
// des.* Lua table from the nhl_functions array, mapping each name to its
// lspo_* C function. In JS, the equivalent dispatch is the API object
// returned by createSpecialLevelApi; its methods correspond to the C
// entries: message, monster, object, level_flags, level_init, engraving,
// mineralize, door, stair, ladder, grave, altar, map, feature, terrain,
// replace_terrain, room, corridor, random_corridors, gold, trap,
// mazewalk, drawbridge, region, levregion, exclusion, wallify,
// wall_property, non_diggable, non_passwall, teleport_region,
// reset_level, finalize_level, gas_cloud.
function l_register_des(api) {
    return api;
}

// C ref: sp_lev.c gc.coder and the file-scope statics sp_lev.c keeps beside
// it (SpLev_Map, the xstart/ystart/xsize/ysize frame, splev_init_present,
// icedpools). gc.coder lives in the game state as state.gc.coder: NULL until
// create_des_coder() allocates it, freed (set to null) by load_special(),
// lspo_reset_level() and themerooms_post_level_generate(). A level program
// run by #wizloadlua (nhlua.c load_lua()) creates it on its first des.* call
// and leaves it for the next special-level load to reuse. Neither is saved.
export function sp_lev_frame(state) {
    return state.sp_lev_frame ??= {
        xMazeMax: (COLNO - 1) & ~1,
        yMazeMax: (ROWNO - 1) & ~1,
        splevMap: Array.from({ length: COLNO }, () => new Uint8Array(ROWNO)),
    };
}

// C ref: sp_lev.c create_des_coder(). Allocates the coder on first use;
// load_special() and every des.* function call it first.
export function create_des_coder(state) {
    state.gc ??= {};
    if (!state.gc.coder)
        state.gc.coder = sp_level_coder_init(state, sp_lev_frame(state));
    return state.gc.coder;
}

// The des.* functions that do not start with create_des_coder() in C:
// reset_level() and finalize_level() decide for themselves, and the rest are
// not des.* functions (finish() is load_special()'s post-processing).
const DES_WITHOUT_CODER = new Set([
    'reset_level', 'finalize_level', 'finish', 'random', 'shuffle',
    'parse_config',
]);

// The des.* functions below take their Lua arguments as the array `args`
// and read C's globals from `env`: `env.state` for svl.level, `env.coder`
// for gc.coder, and `env.frame` for sp_lev.c's file-scope placement state.

// C ref: sp_lev.c lspo_message(). Appends a line to gl.lev_message, which
// do.c delivers after the destination map is drawn.
export function lspo_message(args, env) {
    const { state } = env;
    if (args.length < 1) throw new Error('Wrong parameters');
    const msg = cStringPrefix(luaL_checkstring(args[0]));
    state.gl ??= {};
    const old = state.gl.lev_message;
    state.gl.lev_message = old != null ? `${old}\n${msg}` : msg;
}

// C ref: sp_lev.c get_table_monclass(). The class of a one-character
// `class` field, or -1. The C keeps the character and converts it in
// create_monster(); this port stores the class index def_char_to_monclass()
// returns, which its level loaders also pass directly.
export function get_table_monclass(table) {
    if (Number.isInteger(table.class)) return table.class;
    const s = get_table_str_opt(table, 'class', null);
    let ret = -1;
    if (s && s.length === 1) ret = def_char_to_monclass(s);
    return ret;
}

// C ref: sp_lev.c find_montype(). The species a monster name denotes, with
// its gender: a one-gender species keeps its own, and any other takes the
// name's gender or a coin flip. The C reads the name through
// name_to_monplus(); the port's level loaders may instead pass the index
// that call would return, with `parsedGender` standing for the gender it
// would report.
export function find_montype(s, env, parsedGender = NEUTRAL) {
    const { state } = env;
    let i;
    let mgend;
    if (typeof s === 'string') {
        const parsed = name_to_monplus(s, { state, gender: NEUTRAL });
        i = parsed.mnum;
        mgend = parsed.gender;
    } else {
        i = s;
        mgend = parsedGender;
    }
    if (i >= LOW_PM && i < NUMMONS) {
        const ptr = state.mons[i];
        if (is_male(ptr) || is_female(ptr))
            mgend = is_female(ptr) ? FEMALE : MALE;
        else
            mgend = (mgend === FEMALE) ? FEMALE
                : (mgend === MALE) ? MALE : env.random.rn2(2);
        return { montype: i, mgender: mgend };
    }
    return { montype: NON_PM, mgender: NEUTRAL };
}

// C ref: sp_lev.c get_table_montype(). The species and gender of the `id`
// field through find_montype(). An absent field answers NON_PM and NEUTRAL,
// the value the C caller's gender variable already holds. The `id` may be
// a species index with `parsedGender`, as find_montype() describes.
export function get_table_montype(table, env) {
    const s = Number.isInteger(table.id)
        ? table.id : get_table_str_opt(table, 'id', null);
    if (s != null) {
        const found = find_montype(s, env, table.parsedGender ?? NEUTRAL);
        if (found.montype === NON_PM) throw new Error('Unknown monster id');
        return found;
    }
    return { montype: NON_PM, mgender: NEUTRAL };
}

// C ref: sp_lev.c get_table_xy_or_coord(). The x and y of a table that
// gives either x= and y= or coord=; -1 for an axis it omits. The result is
// absolute rather than map-relative; the caller decides how to interpret it.
export function get_table_xy_or_coord(table) {
    let mx = get_table_int_opt(table, 'x', -1);
    let my = get_table_int_opt(table, 'y', -1);

    if (mx === -1 && my === -1) {
        const c = { x: mx, y: my };
        get_coord(table.coord, c);
        mx = c.x;
        my = c.y;
    }
    return { x: mx, y: my };
}

// C ref: sp_lev.c lspo_monster(). `args` holds the des.monster() arguments
// in Lua order and `croom` is gc.coder->croom; the themed-room fills pass
// their room the way their Lua contents functions call des.monster().
// Fills the C `monster` descriptor, creates the monster, and runs a custom
// inventory callback. The port stores `class` as the class index
// def_char_to_monclass() returns rather than the class character.
export function lspo_monster(args, croom, rawEnv = {}) {
    const env = {
        ...rawEnv,
        state: rawEnv.state ?? game,
        random: rawEnv.random ?? coreRandom,
        spObjectContext: rawEnv.spObjectContext
            ?? new_sp_lev_object_context(),
    };
    const { state } = env;
    const argc = args.length;
    const tmpmons = {
        id: NON_PM,
        class: -1,
        coord: 0,
        x: -1,
        y: -1,
        peaceful: -1,
        asleep: -1,
        name: null,
        appear: 0,
        appear_as: null,
        sp_amask: AM_SPLEV_RANDOM,
        female: 0,
        invis: 0,
        cancelled: 0,
        revived: 0,
        avenge: 0,
        fleeing: 0,
        blinded: 0,
        paralyzed: 0,
        stunned: 0,
        confused: 0,
        seentraps: 0,
        has_invent: DEFAULT_INVENT,
        waiting: 0,
        mm_flags: NO_MM_FLAGS,
        m_lev_adj: 0,
    };
    let mx = -1;
    let my = -1;
    let mgend = NEUTRAL;
    let inventory = null;

    // The C repeats this reading of the string argument in each of its
    // three positional forms.
    const readParamstr = (paramstr) => {
        if (paramstr.length === 1) {
            tmpmons.class = def_char_to_monclass(paramstr);
            tmpmons.id = NON_PM;
        } else {
            tmpmons.class = -1;
            ({ montype: tmpmons.id, mgender: mgend }
                = find_montype(paramstr, env));
            tmpmons.female = (mgend === FEMALE) ? FEMALE
                : (mgend === MALE) ? MALE : env.random.rn2(2);
        }
    };

    if (argc === 1 && typeof args[0] === 'string') {
        readParamstr(luaL_checkstring(args[0]));
    } else if (argc === 2 && typeof args[0] === 'string'
               && args[1] != null && typeof args[1] === 'object') {
        const paramstr = luaL_checkstring(args[0]);
        const c = { x: mx, y: my };
        get_coord(args[1], c);
        mx = c.x;
        my = c.y;
        readParamstr(paramstr);
    } else if (argc === 3) {
        const paramstr = luaL_checkstring(args[0]);
        mx = luaL_checkinteger(args[1]);
        my = luaL_checkinteger(args[2]);
        readParamstr(paramstr);
    } else {
        let keep_default_invent = -1; /* -1 = unspecified */
        const table = lcheck_param_table(args);

        tmpmons.peaceful = get_table_boolean_opt(table, 'peaceful', BOOL_RANDOM);
        tmpmons.asleep = get_table_boolean_opt(table, 'asleep', BOOL_RANDOM);
        tmpmons.name = get_table_str_opt(table, 'name', null);
        tmpmons.appear = 0;
        tmpmons.appear_as = null;
        tmpmons.sp_amask = get_table_align(table);
        tmpmons.female = get_table_boolean_opt(table, 'female', BOOL_RANDOM);
        tmpmons.invis = get_table_boolean_opt(table, 'invisible', 0);
        tmpmons.cancelled = get_table_boolean_opt(table, 'cancelled', 0);
        tmpmons.revived = get_table_boolean_opt(table, 'revived', 0);
        tmpmons.avenge = get_table_boolean_opt(table, 'avenge', 0);
        tmpmons.fleeing = get_table_int_opt(table, 'fleeing', 0);
        tmpmons.blinded = get_table_int_opt(table, 'blinded', 0);
        tmpmons.paralyzed = get_table_int_opt(table, 'paralyzed', 0);
        tmpmons.stunned = get_table_boolean_opt(table, 'stunned', 0);
        tmpmons.confused = get_table_boolean_opt(table, 'confused', 0);
        tmpmons.waiting = get_table_boolean_opt(table, 'waiting', 0);
        tmpmons.m_lev_adj = get_table_int_opt(table, 'm_lev_adj', 0);
        tmpmons.seentraps = 0; /* TODO: list of trap names to bitfield */
        keep_default_invent
            = get_table_boolean_opt(table, 'keep_default_invent', -1);

        if (!get_table_boolean_opt(table, 'tail', 1))
            tmpmons.mm_flags |= MM_NOTAIL;
        if (!get_table_boolean_opt(table, 'group', 1))
            tmpmons.mm_flags |= MM_NOGRP;
        if (get_table_boolean_opt(table, 'adjacentok', 0))
            tmpmons.mm_flags |= MM_ADJACENTOK;
        if (get_table_boolean_opt(table, 'ignorewater', 0))
            tmpmons.mm_flags |= MM_IGNOREWATER;
        if (!get_table_boolean_opt(table, 'countbirth', 1))
            tmpmons.mm_flags |= MM_NOCOUNTBIRTH;

        const mappear = get_table_str_opt(table, 'appear_as', null);
        if (mappear) {
            if (mappear.startsWith('obj:')) {
                tmpmons.appear = M_AP_OBJECT;
            } else if (mappear.startsWith('mon:')) {
                tmpmons.appear = M_AP_MONSTER;
            } else if (mappear.startsWith('ter:')) {
                tmpmons.appear = M_AP_FURNITURE;
            } else {
                throw new Error('Unknown appear_as type');
            }
            tmpmons.appear_as = mappear.slice(4);
        }

        ({ x: mx, y: my } = get_table_xy_or_coord(table));

        ({ montype: tmpmons.id, mgender: mgend }
            = get_table_montype(table, env));
        /* get_table_montype will return a random gender if the species isn't
         * all-male or all-female; if the level designer specified a certain
         * gender, override that random one now, unless it *is* a one-gender
         * species, in which case don't override (don't permit creation of a
         * male nymph or female Nazgul, etc.) */
        if (mgend !== NEUTRAL
            && (tmpmons.female === BOOL_RANDOM
                || is_female(state.mons[tmpmons.id])
                || is_male(state.mons[tmpmons.id])))
            tmpmons.female = mgend;
        /* safety net - if find_montype did not find a gender for this species
         * (should cause a lua error anyway) */
        if (tmpmons.female === BOOL_RANDOM)
            tmpmons.female = 0;

        tmpmons.class = get_table_monclass(table);

        inventory = table.inventory ?? null;
        if (inventory != null) {
            /* overwrite DEFAULT_INVENT - most times inventory is specified,
             * the monster should not get its species' default inventory. Only
             * provide it if explicitly requested. */
            tmpmons.has_invent = CUSTOM_INVENT;
            if (keep_default_invent === 1)
                tmpmons.has_invent |= DEFAULT_INVENT;
        } else {
            /* if keep_default_invent was not specified (-1), keep has_invent
             * as DEFAULT_INVENT and provide the species' default inventory.
             * But if it was explicitly set to false, provide *no* inventory. */
            if (keep_default_invent === 0)
                tmpmons.has_invent = NO_INVENT;
        }
    }

    if (mx === -1 && my === -1)
        tmpmons.coord = SP_COORD_PACK_RANDOM(0);
    else
        tmpmons.coord = SP_COORD_PACK(mx, my);

    // C: tmpmons.class = monsym(&mons[tmpmons.id]), the class character;
    // the port's class index is the species' mlet.
    if (tmpmons.id !== NON_PM && tmpmons.class === -1)
        tmpmons.class = state.mons[tmpmons.id].mlet;

    const mtmp = create_monster(tmpmons, croom, env);
    const finishInventory = (resolvedMtmp) => {
        if ((tmpmons.has_invent & CUSTOM_INVENT)
            && typeof inventory === 'function') {
            const context = env.spObjectContext;
            const finishCallback = () => {
                spo_end_moninvent(context, env);
                return resolvedMtmp;
            };
            let maybeCallback;
            try {
                // C lspo_monster runs the custom inventory closure after
                // create_monster() has returned.  Shape-changing monster
                // creation can now cross an async floor-effects or wizard
                // control owner, so preserve that source order when the
                // constructor returns a Promise as well.
                maybeCallback = inventory(resolvedMtmp, env);
            } catch (e) {
                // C has no exception path; keep the shared carrier from
                // leaking into a later descriptor when the callback fails.
                context.inventCarryingMonster = null;
                throw e;
            }
            if (maybeCallback && typeof maybeCallback.then === 'function') {
                return maybeCallback.then(finishCallback, (error) => {
                    context.inventCarryingMonster = null;
                    throw error;
                });
            }
            return finishCallback();
        }
        return resolvedMtmp;
    };
    return mtmp && typeof mtmp.then === 'function'
        ? mtmp.then(finishInventory) : finishInventory(mtmp);
}

// C ref: sp_lev.c get_table_int_or_random(). The field's integer, or
// `rndval` when it is absent or "random".
export function get_table_int_or_random(table, name, rndval) {
    const value = table[name];
    if (value == null) return rndval;
    if (typeof value !== 'number') {
        const tmp = typeof value === 'string' ? value : null;

        if (tmp && lcase(tmp) === 'random') return rndval;
        throw new Error(
            `Expected integer or "random" for "${name}", got `
            + (tmp ? `"${tmp}"` : '<Null>'),
        );
    }
    return luaL_checkinteger(value);
}

// C ref: sp_lev.c get_table_buc(). The curse state create_object() applies:
// 0 random, 1 blessed, 2 uncursed, 3 cursed, 4 not-cursed, 5 not-uncursed,
// 6 not-blessed.
export function get_table_buc(table) {
    const bucs = [
        'random', 'blessed', 'uncursed', 'cursed',
        'not-cursed', 'not-uncursed', 'not-blessed',
    ];
    const bucs2i = [0, 1, 2, 3, 4, 5, 6, 0];
    const curse_state = bucs2i[get_table_option(table, 'buc', 'random', bucs)];

    return curse_state;
}

// C ref: sp_lev.c get_table_objclass(). The class of a one-character
// `class` field, or -1. As with get_table_monclass(), this port stores the
// class index def_char_to_objclass() returns, which its loaders also pass
// directly, where the C keeps the character.
export function get_table_objclass(table) {
    if (Number.isInteger(table.class)) return table.class;
    const s = get_table_str_opt(table, 'class', null);
    let ret = -1;
    if (s && s.length === 1) ret = def_char_to_objclass(s);
    return ret;
}

// C ref: sp_lev.c find_objtype(). The object type named by `s`, matched
// first by name (within `oclass` when given, or the class a "ring of "-style
// prefix implies) and then by description. `oclass` is the class index the
// C would derive from its class character; MAXOCLASSES or a negative value
// means any class.
export function find_objtype(s, oclass, state = game) {
    if (s) {
        const objects = getObjects(state);
        let objname;
        let cls = oclass;

        /* In objects.h, some item classes are defined without prefixes
           (such as "scroll of ") in their names, making some names (such
           as "teleportation") ambiguous.  Get the object class if it is
           specified, and only return an object of the matching class. */
        const class_prefixes = [
            ['ring of ', RING_CLASS],
            ['potion of ', POTION_CLASS],
            ['scroll of ', SCROLL_CLASS],
            ['spellbook of ', SPBOOK_CLASS],
            ['wand of ', WAND_CLASS],
        ];

        if (cls === MAXOCLASSES || cls < 0)
            cls = 0;

        if (strstri(s, ' of ') >= 0) {
            for (const [p, pclass] of class_prefixes) {
                if (lcase(s).startsWith(p)) {
                    cls = pclass;
                    s = s.slice(p.length);
                    break;
                }
            }
        }

        /* find by object name */
        for (let i = 0; i < NUM_OBJECTS; i++) {
            objname = OBJ_NAME(objects[i], state);
            if ((!cls || cls === objects[i].oc_class)
                && objname && lcase(s) === lcase(objname))
                return i;
        }

        /*
         * FIXME:
         *  If the file specifies "orange potion", the actual object
         *  description is just "orange" and won't match.  [There's a
         *  reason that wish handling is insanely complicated.]  And
         *  even if that gets fixed, if the file specifies "gray stone"
         *  it will start matching but would always pick the first one.
         *
         *  "orange potion" is an unlikely thing to have in a special
         *  level description but "gray stone" is not....
         */

        /* find by object description */
        for (let i = 0; i < NUM_OBJECTS; i++) {
            objname = OBJ_DESCR(objects[i], state);
            if (objname && lcase(s) === lcase(objname))
                return i;
        }

        throw new Error('Unknown object id');
    }
    return STRANGE_OBJECT;
}

// C ref: sp_lev.c get_table_objtype(). The object type of the `id` field
// through find_objtype(), restricted to the `class` field's class. The
// port's loaders may give `id` as the object type index instead.
export function get_table_objtype(table, state = game) {
    if (Number.isInteger(table.id)) return table.id;
    const s = get_table_str_opt(table, 'id', null);
    const oclass = get_table_objclass(table);
    const ret = find_objtype(s, oclass, state);

    return ret;
}

// C ref: sp_lev.c lspo_level_flags(). Each argument names a level flag;
// the names compare case-insensitively.
export function lspo_level_flags(args, env) {
    const { state, coder, frame } = env;
    const flags = state.level.flags;

    if (args.length < 1) throw new Error('expected string params');

    for (const arg of args) {
        const s = luaL_checkstring(arg);

        switch (lcase(s)) {
        case 'noteleport': flags.noteleport = true; break;
        case 'hardfloor': flags.hardfloor = true; break;
        case 'nommap': flags.nommap = true; break;
        case 'shortsighted': flags.shortsighted = true; break;
        case 'arboreal': flags.arboreal = true; break;
        case 'mazelevel': flags.is_maze_lev = true; break;
        case 'shroud': flags.hero_memory = true; break;
        case 'graveyard': flags.graveyard = true; break;
        case 'icedpools': frame.icedpools = true; break;
        case 'corrmaze': flags.corrmaze = true; break;
        case 'premapped': coder.premapped = true; break;
        case 'solidify': coder.solidify = true; break;
        case 'sokoban': flags.sokoban_rules = true; break; /* C: Sokoban */
        case 'inaccessibles': coder.check_inaccessibles = true; break;
        case 'noflipx': coder.allow_flips &= ~2; break;
        case 'noflipy': coder.allow_flips &= ~1; break;
        case 'noflip': coder.allow_flips = 0; break;
        case 'temperate': flags.temperature = 0; break;
        case 'hot': flags.temperature = 1; break;
        case 'cold': flags.temperature = -1; break;
        case 'nomongen': flags.rndmongen = false; break;
        case 'nodeathdrops': flags.deathdrops = false; break;
        case 'noautosearch': flags.noautosearch = true; break;
        case 'fumaroles': flags.fumaroles = true; break;
        case 'stormy': flags.stormy = true; break;
        default:
            throw new Error(`Unknown level flag ${s}`);
        }
    }
}

// C ref: sp_lev.c lspo_level_init(). Reads the style table into a lev_init
// record and hands it to splev_initlev().
export function lspo_level_init(args, env) {
    const { state, coder, frame } = env;
    const initstyles = [
        'solidfill', 'mazegrid', 'maze', 'rogue', 'mines', 'swamp',
    ];
    const initstyles2i = [
        LVLINIT_SOLIDFILL, LVLINIT_MAZEGRID, LVLINIT_MAZE, LVLINIT_ROGUE,
        LVLINIT_MINES, LVLINIT_SWAMP, 0,
    ];
    const init_lev = {};

    const table = lcheck_param_table(args);

    frame.splev_init_present = true;

    init_lev.init_style
        = initstyles2i[get_table_option(table, 'style', 'solidfill', initstyles)];
    init_lev.fg = get_table_mapchr_opt(table, 'fg', ROOM);
    init_lev.bg = get_table_mapchr_opt(table, 'bg', INVALID_TYPE);
    init_lev.smoothed = get_table_boolean_opt(table, 'smoothed', 0);
    init_lev.joined = get_table_boolean_opt(table, 'joined', 0);
    init_lev.lit = get_table_boolean_opt(table, 'lit', BOOL_RANDOM);
    init_lev.walled = get_table_boolean_opt(table, 'walled', 0);
    init_lev.filling = get_table_mapchr_opt(table, 'filling', init_lev.fg);
    init_lev.corrwid = get_table_int_opt(table, 'corrwid', -1);
    init_lev.wallthick = get_table_int_opt(table, 'wallthick', -1);
    init_lev.rm_deadends = !get_table_boolean_opt(table, 'deadends', 1);

    coder.lvl_is_joined = init_lev.joined;

    if (init_lev.bg === INVALID_TYPE)
        init_lev.bg = (init_lev.init_style === LVLINIT_SWAMP) ? MOAT : STONE;

    // Every des.level_init() caller awaits the result, so join_map()'s
    // impossible() prints at C's point in the fill.
    return finish_steps(splev_initlev_steps(init_lev, frame, state),
        impossible_printer(state));
}

// C ref: sp_lev.c lspo_engraving(). Forms: engraving({ x, y, type, text })
// or engraving({ coord, type, text }), and engraving({x, y}, type, text).
// A square that is absent or -1,-1 is chosen at random.
export function lspo_engraving(args, env) {
    const { state, coder } = env;
    const engrtypes = ['dust', 'engrave', 'burn', 'mark', 'blood'];
    const engrtypes2i = [DUST, ENGRAVE, BURN, MARK, ENGR_BLOOD, 0];
    let etyp = DUST;
    let txt = null;
    let ecoord;
    let x = -1;
    let y = -1;
    const argc = args.length;
    let guardobjs = 0;
    let wipeout = 1;

    if (argc === 1) {
        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        etyp = engrtypes2i[get_table_option(table, 'type', 'engrave', engrtypes)];
        txt = get_table_str(table, 'text');
        wipeout = get_table_boolean_opt(table, 'degrade', 1);
        guardobjs = get_table_boolean_opt(table, 'guardobjects', 0);
    } else if (argc === 3) {
        const c = { x, y };
        get_coord(args[0], c);
        x = c.x;
        y = c.y;
        etyp = engrtypes2i[luaL_checkoption(args[1], 'engrave', engrtypes)];
        txt = luaL_checkstring(args[2]);
    } else {
        throw new Error('Wrong parameters');
    }

    if (x === -1 && y === -1)
        ecoord = SP_COORD_PACK_RANDOM(0);
    else
        ecoord = SP_COORD_PACK(x, y);

    const c = { x, y };
    get_location_coord(c, DRY, coder.croom, ecoord, env);
    make_engr_at(c.x, c.y, txt == null ? null : cStringPrefix(txt), null, 0, etyp, env);
    const ep = engr_at(c.x, c.y, state);
    if (ep) {
        ep.guardobjects = Boolean(guardobjs);
        ep.nowipeout = !wipeout;
    }
}

// C ref: sp_lev.c lspo_mineralize(). Seeds the level's rock with gold, gems,
// and kelp at the table's probabilities, skipping mklev.c's level checks.
export function lspo_mineralize(args, env) {
    const table = lcheck_param_table(args);
    /* -1 produces default mineralize behavior */
    const gem_prob = get_table_int_opt(table, 'gem_prob', -1);
    const gold_prob = get_table_int_opt(table, 'gold_prob', -1);
    const kelp_moat = get_table_int_opt(table, 'kelp_moat', -1);
    const kelp_pool = get_table_int_opt(table, 'kelp_pool', -1);

    mineralize(kelp_pool, kelp_moat, gold_prob, gem_prob, true,
               { state: env.state });
}

// C ref: sp_lev.c get_table_roomtype_opt(). The room type the field names
// in room_types[], compared case-insensitively; `defval` when the field is
// absent, empty, or unknown (the C reports an unknown name through
// impossible()).
export function get_table_roomtype_opt(table, name, defval, env = {}) {
    const roomstr = get_table_str_opt(table, name, '');
    let res = defval;

    if (roomstr) {
        const found = room_types.find(
            ([rname]) => lcase(rname) === lcase(roomstr),
        );
        if (found)
            res = found[1];
        else if (typeof env.hooks?.impossible === 'function')
            env.hooks.impossible(`Unknown room type '${roomstr}'`, env);
        else
            sync_impossible(`Unknown room type '${roomstr}'`, env.state ?? game);
    }
    return res;
}

// C ref: sp_lev.c get_table_intarray_entry(). Entry `entrynum`, counted
// from 1 as Lua does, of an array table; it must be a number. The C names
// entry #1 in its error whatever the entry asked for.
export function get_table_intarray_entry(table, entrynum) {
    const value = table[entrynum - 1];
    if (typeof value === 'number')
        return Number.isInteger(value) ? value : 0;
    throw new Error(
        `Array entry #1 is ${luaL_typename(value)}, expected number`,
    );
}

// C ref: sp_lev.c get_table_region(). Reads the four-entry array field
// `name` into `r` as x1, y1, x2, y2. An absent optional field leaves `r`
// untouched; a field that is not a four-entry array is an error. Answers 1
// as the source does on every path it returns from.
export function get_table_region(table, name, r, optional) {
    const value = table[name];
    if (optional && value == null)
        return 1;

    if (value == null || typeof value !== 'object')
        throw new Error(`table expected, got ${luaL_typename(value)}`);

    const arrlen = Array.isArray(value) ? value.length : 0;
    if (arrlen !== 4)
        throw new Error('Not a region');

    r.x1 = get_table_intarray_entry(value, 1);
    r.y1 = get_table_intarray_entry(value, 2);
    r.x2 = get_table_intarray_entry(value, 3);
    r.y2 = get_table_intarray_entry(value, 4);

    return 1;
}

// C ref: sp_lev.c get_coord(). Reads a coordinate table into `c`: either
// x= and y= fields or a two-entry array. A nil value leaves `c` unchanged
// and answers false; any other non-table is an error.
export function get_coord(value, c) {
    let ret = false;

    if (value != null && typeof value === 'object') {
        let gotx = false;

        if (value.x != null) {
            c.x = luaL_checkinteger(value.x);
            gotx = true;
        }

        if (gotx) {
            if (value.y != null) {
                c.y = luaL_checkinteger(value.y);
                ret = true;
            } else {
                throw new Error('Not a coordinate');
            }
        } else {
            const arrlen = Array.isArray(value) ? value.length : 0;
            if (arrlen !== 2)
                throw new Error('Not a coordinate');

            c.x = get_table_intarray_entry(value, 1);
            c.y = get_table_intarray_entry(value, 2);

            return true;
        }
    } else if (value != null) {
        /* non-existent coord is ok */
        throw new Error('non-table coord specified');
    }
    return ret;
}

// A Lua table argument: a des.* call receives tables as objects or arrays.
function isLuaTable(value) {
    return value != null && typeof value === 'object';
}

// C ref: nhlua.c nhl_get_xy_params(). The x and y of a two-integer argument
// list or a single coordinate table; false, leaving `c` alone, for anything
// else. It lives here rather than in nhlua.js because it reads the table
// through sp_lev.c's get_coord().
export function nhl_get_xy_params(args, c) {
    const argc = args.length;
    let ret = false;

    if (argc === 2) {
        c.x = lua_tointeger(args[0]);
        c.y = lua_tointeger(args[1]);
        ret = true;
    } else if (argc === 1 && isLuaTable(args[0])) {
        ret = get_coord(args[0], c);
    }
    return ret;
}

// C ref: sp_lev.c lspo_room(). Reads the room table, builds the room or
// subroom under gc.coder->croom, runs its contents callback with the room
// table, and closes it with spo_endroom(). A failed room, or a room whose
// parent failed, still pushes an entry so that nested contents stay
// balanced. During themed-room generation a failure sets
// gt.themeroom_failed, which the port keeps in state.themeroom_failed.
export function lspo_room(args, env) {
    const { state, coder, frame } = env;

    if (state.in_mk_themerooms && state.themeroom_failed)
        return;

    const table = lcheck_param_table(args);

    if (coder.n_subroom > MAX_NESTED_ROOMS) {
        throw new Error('Too deeply nested rooms?!');
    } else {
        const left_or_right = [
            'left', 'half-left', 'center', 'half-right', 'right',
            'none', 'random',
        ];
        const l_or_r2i = [
            SPLEV_LEFT, SPLEV_H_LEFT, SPLEV_CENTER, SPLEV_H_RIGHT,
            SPLEV_RIGHT, -1, -1, -1,
        ];
        const top_or_bot = ['top', 'center', 'bottom', 'none', 'random'];
        const t_or_b2i = [SPLEV_TOP, SPLEV_CENTER, SPLEV_BOTTOM, -1, -1, -1];
        const tmproom = {};

        const { x: rx, y: ry } = get_table_xy_or_coord(table);
        tmproom.x = rx;
        tmproom.y = ry;
        if ((tmproom.x === -1 || tmproom.y === -1) && tmproom.x !== tmproom.y)
            throw new Error('Room must have both x and y');

        tmproom.w = get_table_int_opt(table, 'w', -1);
        tmproom.h = get_table_int_opt(table, 'h', -1);

        if ((tmproom.w === -1 || tmproom.h === -1) && tmproom.w !== tmproom.h)
            throw new Error('Room must have both w and h');

        tmproom.xalign = l_or_r2i[get_table_option(table, 'xalign', 'random',
                                                   left_or_right)];
        tmproom.yalign = t_or_b2i[get_table_option(table, 'yalign', 'random',
                                                   top_or_bot)];
        tmproom.rtype = get_table_roomtype_opt(table, 'type', OROOM, env);
        tmproom.chance = get_table_int_opt(table, 'chance', 100);
        tmproom.rlit = get_table_int_opt(table, 'lit', -1);
        /* theme rooms default to unfilled */
        tmproom.needfill = get_table_int_opt(table, 'filled',
                                             state.in_mk_themerooms ? 0 : 1);
        tmproom.joined = get_table_boolean_opt(table, 'joined', true);

        if (!coder.failed_room[coder.n_subroom - 1]) {
            const tmpcr = build_room(tmproom, coder.croom,
                                     env.random.rn2, env.random.rnd);
            if (tmpcr) {
                const n = coder.n_subroom;

                coder.tmproomlist[n] = tmpcr; /* TRUE to get here... */
                coder.failed_room[n] = false;
                /* added a subroom, make parent room irregular */
                if (coder.tmproomlist[n - 1])
                    coder.tmproomlist[n - 1].irregular = true;
                coder.n_subroom++;
                update_croom(coder);
                const finishRoom = () => {
                    spo_endroom(coder, frame, state);
                    add_doors_to_room(tmpcr);
                    return;
                };
                if (typeof table.contents === 'function') {
                    const maybeContents = table.contents(
                        l_push_mkroom_table(tmpcr),
                    );
                    if (maybeContents && typeof maybeContents.then === 'function')
                        return maybeContents.then(finishRoom);
                }
                return finishRoom();
            }
            if (state.in_mk_themerooms)
                state.themeroom_failed = true;
        } /* failed to create parent room, so fail this too */
    }
    coder.tmproomlist[coder.n_subroom] = null;
    coder.failed_room[coder.n_subroom] = true;
    coder.n_subroom++;
    update_croom(coder);
    spo_endroom(coder, frame, state);
    if (state.in_mk_themerooms)
        state.themeroom_failed = true;
}

// C ref: sp_lev.c spo_endroom(). Pops the current room; leaving the
// top-level room restores the whole-map frame when no map set one.
function spo_endroom(coder, frame, state) {
    if (coder.n_subroom > 1) {
        coder.n_subroom--;
        coder.tmproomlist[coder.n_subroom] = null;
        coder.failed_room[coder.n_subroom] = true;
    } else {
        /* no subroom, get out of top-level room */
        /* Need to ensure xstart/ystart/xsize/ysize have something sensible,
           in case there's some stuff to be created outside the outermost
           room, and there's no MAP. */
        if (frame.xsize <= 1 && frame.ysize <= 1)
            reset_xystart_size(frame, state);
    }
    update_croom(coder);
}

// C ref: sp_lev.c l_create_stairway(), shared by lspo_stair() and
// lspo_ladder(). Takes a table with dir and x/y or coord, or a direction
// string followed by the coordinate forms nhl_get_xy_params() reads. A
// random square is chosen under good_stair_loc(); any trap there is
// removed, and the square is marked in SpLev_Map.
function l_create_stairway(args, using_ladder, env) {
    const { state, coder, frame } = env;
    const stairdirs = ['down', 'up'];
    const stairdirs2i = [0, 1];
    const argc = args.length;
    let x = -1, y = -1;
    let up = 0; /* default is down */

    if (argc === 1 && isLuaTable(args[0])) {
        const table = lcheck_param_table(args);
        const a = get_table_xy_or_coord(table);
        up = stairdirs2i[get_table_option(table, 'dir', 'down', stairdirs)];
        x = a.x;
        y = a.y;
    } else {
        const c = { x: -1, y: -1 };
        let rest = args;
        if (argc > 0 && typeof args[0] === 'string') {
            up = stairdirs2i[luaL_checkoption(args[0], 'down', stairdirs)];
            rest = args.slice(1);
        }
        nhl_get_xy_params(rest, c);
        x = c.x;
        y = c.y;
    }

    let scoord;
    if (x === -1 && y === -1) {
        set_ok_location_func(good_stair_loc);
        scoord = SP_COORD_PACK_RANDOM(0);
    } else
        scoord = SP_COORD_PACK(x, y);

    const c = { x, y };
    get_location_coord(c, DRY, coder.croom, scoord, { frame, state });
    set_ok_location_func(null);
    ({ x, y } = c);
    const badtrap = t_at(x, y, state);
    if (badtrap)
        deltrap(badtrap, state);
    frame.splevMap[x][y] = 1;

    if (using_ladder) {
        const loc = state.level.at(x, y);
        loc.typ = LADDER;
        if (up) {
            const dest = {
                dnum: state.u.uz.dnum,
                dlevel: state.u.uz.dlevel - 1,
            };
            stairway_add(x, y, true, true, dest);
            loc.flags = LA_UP;
        } else {
            const dest = {
                dnum: state.u.uz.dnum,
                dlevel: state.u.uz.dlevel + 1,
            };
            stairway_add(x, y, false, true, dest);
            loc.flags = LA_DOWN;
        }
    } else {
        // sp_lev.c:4209–4210 forces fixed-coordinate stairs onto ROOM.
        // Every des.stair() caller awaits the result, so mkstairs()'s
        // impossible() prints at C's point in the level program.
        return mkstairs(x, y, up, coder.croom, !(scoord & SP_COORD_IS_RANDOM),
            impossible_printer(state));
    }
    return undefined;
}

// C ref: sp_lev.c lspo_stair().
export function lspo_stair(args, env) {
    return l_create_stairway(args, false, env);
}

// C ref: sp_lev.c lspo_ladder().
export function lspo_ladder(args, env) {
    return l_create_stairway(args, true, env);
}

// C ref: sp_lev.c lspo_grave(). grave(), grave(x, y, "text"), and the
// table form with x/y or coord and an optional text. A random square is a
// DRY one; a square without a trap becomes a grave through make_grave(),
// which composes an epitaph when the text is absent.
export function lspo_grave(args, env) {
    const { state, coder, frame } = env;
    const argc = args.length;
    let x, y, ax, ay, txt;

    if (argc === 3) {
        x = ax = luaL_checkinteger(args[0]);
        y = ay = luaL_checkinteger(args[1]);
        txt = luaL_checkstring(args[2]);
    } else {
        const table = lcheck_param_table(args);

        ({ x: ax, y: ay } = get_table_xy_or_coord(table));
        x = ax;
        y = ay;
        txt = get_table_str_opt(table, 'text', null);
    }

    let scoord;
    if (x === -1 && y === -1)
        scoord = SP_COORD_PACK_RANDOM(0);
    else
        scoord = SP_COORD_PACK(ax, ay);

    const c = { x, y };
    get_location_coord(c, DRY, coder.croom, scoord, { frame, state });
    ({ x, y } = c);

    if (isok(x, y) && !t_at(x, y, state)) {
        state.level.at(x, y).typ = GRAVE;
        make_grave(x, y, txt, env); /* note: 'txt' might be Null */
    }
}

// C ref: sp_lev.c lspo_altar(). Reads x/y or coord, the alignment through
// get_table_align(), and the shrine kind, then calls create_altar().
export function lspo_altar(args, env) {
    const { coder, frame } = env;
    const shrines = ['altar', 'shrine', 'sanctum'];
    const shrines2i = [0, 1, 2, 0];

    const table = lcheck_param_table(args);

    const { x, y } = get_table_xy_or_coord(table);

    const al = get_table_align(table);
    const shrine = shrines2i[get_table_option(table, 'type', 'altar', shrines)];

    let acoord;
    if (x === -1 && y === -1)
        acoord = SP_COORD_PACK_RANDOM(0);
    else
        acoord = SP_COORD_PACK(x, y);

    const tmpaltar = { coord: acoord, sp_amask: al, shrine };

    return create_altar(tmpaltar, coder.croom, frame, env);
}

// C ref: sp_lev.c trap_types[]. The Lua trap names in the source's order;
// "random" stands for a random trap type (-1).
const trap_types = Object.freeze([
    ['arrow', ARROW_TRAP],
    ['dart', DART_TRAP],
    ['falling rock', ROCKTRAP],
    ['board', SQKY_BOARD],
    ['bear', BEAR_TRAP],
    ['land mine', LANDMINE],
    ['rolling boulder', ROLLING_BOULDER_TRAP],
    ['sleep gas', SLP_GAS_TRAP],
    ['rust', RUST_TRAP],
    ['fire', FIRE_TRAP],
    ['pit', PIT],
    ['spiked pit', SPIKED_PIT],
    ['hole', HOLE],
    ['trap door', TRAPDOOR],
    ['teleport', TELEP_TRAP],
    ['level teleport', LEVEL_TELEP],
    ['magic portal', MAGIC_PORTAL],
    ['web', WEB],
    ['statue', STATUE_TRAP],
    ['magic', MAGIC_TRAP],
    ['anti magic', ANTI_MAGIC],
    ['polymorph', POLY_TRAP],
    ['vibrating square', VIBRATING_SQUARE],
    ['random', -1],
]);

// C ref: sp_lev.c get_table_traptype_opt(). The trap type of an optional
// name field, compared case-insensitively; `defval` when the field is
// absent, empty, or not a trap name.
export function get_table_traptype_opt(table, name, defval) {
    const trapstr = get_table_str_opt(table, name, '');
    let res = defval;

    if (trapstr) {
        for (const [trapname, type] of trap_types)
            if (lcase(trapstr) === trapname) {
                res = type;
                break;
            }
    }
    return res;
}

// C ref: sp_lev.c get_trapname_bytype(). The Lua name of a trap type, or
// null for a type the table lacks (NO_TRAP among them).
export function get_trapname_bytype(ttyp) {
    for (const [trapname, type] of trap_types)
        if (ttyp === type)
            return trapname;

    return null;
}

// C ref: sp_lev.c get_traptype_byname(). The trap type of a Lua trap name,
// compared case-insensitively; NO_TRAP for an unknown name.
export function get_traptype_byname(trapname) {
    // C strcmpi() sees the first NUL-terminated positional argument.
    const prefix = trapname.split('\0', 1)[0];
    for (const [name, type] of trap_types)
        if (lcase(prefix) === name)
            return type;

    return NO_TRAP;
}

// C ref: sp_lev.c lspo_trap(). trap(), trap("name"), trap("name", {x, y}),
// trap("name", x, y), and the table form with type, x/y or coord,
// spider_on_web, seen, victim, launchfrom, and teledest. Fills the spltrap
// descriptor and hands it to create_trap(); gl.launchplace (the port's
// state.launchplace) holds the launch or teleport square meanwhile and is
// cleared afterwards.
export function lspo_trap(args, env) {
    const { state, coder, frame } = env;
    const tmptrap = {
        spider_on_web: true,
        seen: false,
        novictim: false,
    };
    let x, y;
    const argc = args.length;

    if (argc === 1 && typeof args[0] === 'string') {
        const trapstr = luaL_checkstring(args[0]);

        tmptrap.type = get_traptype_byname(trapstr);
        x = y = -1;
    } else if (argc === 2 && typeof args[0] === 'string'
               && isLuaTable(args[1])) {
        const trapstr = luaL_checkstring(args[0]);

        tmptrap.type = get_traptype_byname(trapstr);
        const c = { x: -1, y: -1 };
        get_coord(args[1], c);
        ({ x, y } = c);
    } else if (argc === 3) {
        const trapstr = luaL_checkstring(args[0]);

        tmptrap.type = get_traptype_byname(trapstr);
        x = luaL_checkinteger(args[1]);
        y = luaL_checkinteger(args[2]);
    } else {
        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        tmptrap.type = get_table_traptype_opt(table, 'type', -1);
        tmptrap.spider_on_web = get_table_boolean_opt(table, 'spider_on_web',
                                                      1);
        tmptrap.seen = get_table_boolean_opt(table, 'seen', false);
        tmptrap.novictim = !get_table_boolean_opt(table, 'victim', true);

        if (isLuaTable(table.launchfrom)) {
            const l = { x: -1, y: -1 };

            get_coord(table.launchfrom, l);
            state.launchplace = { x: l.x, y: l.y };
        }

        if (isLuaTable(table.teledest)) {
            const l = { x: -1, y: -1 };

            get_coord(table.teledest, l);
            state.launchplace = { x: l.x, y: l.y };
        }
    }

    if (tmptrap.type === NO_TRAP)
        throw new Error('Unknown trap type');

    if (x === -1 && y === -1)
        tmptrap.coord = SP_COORD_PACK_RANDOM(0);
    else
        tmptrap.coord = SP_COORD_PACK(x, y);

    // A Promise when a level program that #wizloadlua runs makes a statue
    // trap or a web's spider outside level creation (mklev.c mktrap()).
    const made = create_trap(tmptrap, coder.croom, frame, env);
    const finish = () => {
        state.launchplace = { x: 0, y: 0 };
    };
    return made && typeof made.then === 'function'
        ? made.then(finish) : finish();
}

// C ref: sp_lev.c lspo_gold(). gold(amount, x, y), gold(amount, {x, y}),
// the table form with amount and x/y or coord, and gold(). A random square
// is a DRY one; a negative or absent amount becomes rnd(200).
export function lspo_gold(args, env) {
    const { state, coder, frame } = env;
    const argc = args.length;
    let x, y;
    let amount;
    let gldx, gldy;

    if (argc === 3) {
        amount = luaL_checkinteger(args[0]);
        x = gldx = luaL_checkinteger(args[1]);
        y = gldy = luaL_checkinteger(args[2]);
    } else if (argc === 2 && isLuaTable(args[1])) {
        amount = luaL_checkinteger(args[0]);
        const c = { x: -1, y: -1 };
        get_coord(args[1], c);
        gldx = c.x;
        gldy = c.y;
        x = gldx;
        y = gldy;
    } else if (argc === 0 || (argc === 1 && isLuaTable(args[0]))) {
        const table = lcheck_param_table(args);

        amount = get_table_int_opt(table, 'amount', -1);
        ({ x: gldx, y: gldy } = get_table_xy_or_coord(table));
        x = gldx;
        y = gldy;
    } else {
        throw new Error('Wrong parameters');
    }

    let gcoord;
    if (x === -1 && y === -1)
        gcoord = SP_COORD_PACK_RANDOM(0);
    else
        gcoord = SP_COORD_PACK(gldx, gldy);

    const c = { x, y };
    get_location_coord(c, DRY, coder.croom, gcoord, { frame, state });
    if (amount < 0)
        amount = env.random.rnd(200);
    mkgold(amount, c.x, c.y, env);
}

// C ref: sp_lev.c lspo_corridor(). A corridor between the given doors of
// two rooms; each wall defaults to "all", which create_corridor() rejects.
export function lspo_corridor(args, env) {
    const { state } = env;
    const walldirs = ['all', 'random', 'north', 'west', 'east', 'south'];
    const walldirs2i = [W_ANY, W_RANDOM, W_NORTH, W_WEST, W_EAST, W_SOUTH, 0];

    const table = lcheck_param_table(args);

    const tc = {
        src: {
            room: get_table_int(table, 'srcroom'),
            door: get_table_int(table, 'srcdoor'),
            wall: walldirs2i[get_table_option(table, 'srcwall', 'all',
                                              walldirs)],
        },
        dest: {
            room: get_table_int(table, 'destroom'),
            door: get_table_int(table, 'destdoor'),
            wall: walldirs2i[get_table_option(table, 'destwall', 'all',
                                              walldirs)],
        },
    };

    return create_corridor(tc, state);
}

// C ref: sp_lev.c lspo_random_corridors(). A corridor descriptor with every
// field -1 asks create_corridor() for makecorridors().
export function lspo_random_corridors(args, env) {
    const { state } = env;
    const tc = {
        src: { room: -1, door: -1, wall: -1 },
        dest: { room: -1, door: -1, wall: -1 },
    };

    return create_corridor(tc, state);
}

// C ref: sp_lev.c random_wdir(). Choose a single random W_* direction.
// selvar.c selection_do_grow() (ThemeroomSelection.grow() in
// themerooms.js) makes the same draw inline, since that module cannot
// import this one.
export function random_wdir() {
    const wdirs = [W_NORTH, W_SOUTH, W_EAST, W_WEST];
    return wdirs[rn2(4)];
}

// C ref: sp_lev.c floodfillchk_match_under_typ, the file-scope terrain type
// that set_floodfillchk_match_under() stores for floodfillchk_match_under().
let floodfillchk_match_under_typ = STONE;

// C ref: sp_lev.c floodfillchk_match_under(). The selection flood check
// that accepts squares of the stored terrain type.
export function floodfillchk_match_under(x, y, state = game) {
    return (floodfillchk_match_under_typ === state.level.at(x, y).typ);
}

// C ref: sp_lev.c set_floodfillchk_match_under(). Stores the terrain type
// and installs floodfillchk_match_under() as selvar.c's flood check.
export function set_floodfillchk_match_under(typ) {
    floodfillchk_match_under_typ = typ;
    set_selection_floodfillchk(floodfillchk_match_under);
}

// C ref: sp_lev.c floodfillchk_match_accessible(). The flood check
// ensure_way_out() uses: any accessible square, secret door, or secret
// corridor.
export function floodfillchk_match_accessible(x, y, state = game) {
    const typ = state.level.at(x, y).typ;
    return (ACCESSIBLE(typ) || typ === SDOOR || typ === SCORR);
}

// C ref: sp_lev.c sel_set_feature(). Sets a square's terrain to the feature
// type unless the square is off the map or already holds furniture.
function sel_set_feature(x, y, typ, state = game) {
    if (!isok(x, y))
        return;
    const loc = state.level.at(x, y);
    if (IS_FURNITURE(loc.typ))
        return;
    loc.typ = typ;
}

// C ref: sp_lev.c sel_set_door(). Makes the square a door or secret door
// when it is neither, strips the D_SECRET bit from the state (a secret
// door is at least closed), orients it, and marks it in SpLev_Map.
function sel_set_door(dx, dy, typ, frame, state = game) {
    const x = dx, y = dy;
    const loc = state.level.at(x, y);

    if (!IS_DOOR(loc.typ) && loc.typ !== SDOOR)
        loc.typ = (typ & D_SECRET) ? SDOOR : DOOR;
    if (typ & D_SECRET) {
        typ &= ~D_SECRET;
        if (typ < D_CLOSED)
            typ = D_CLOSED;
    }
    set_door_orientation(x, y, state); /* set/clear levl[x][y].horizontal */
    loc.flags = typ;
    frame.splevMap[x][y] = 1;
}

// C ref: sp_lev.c lspo_door(). door("state", x, y) or the table form with
// state and either x/y or coord, or wall and pos. A random state draws
// rnddoor() before the branch, so the wall form spends that draw and then
// lets create_door() choose again; a square form resolves the coordinate
// through get_location_coord() and writes it with sel_set_door().
export function lspo_door(args, env) {
    const { state, coder, frame } = env;
    const doorstates = [
        'random', 'open', 'closed', 'locked', 'nodoor', 'broken', 'secret',
    ];
    const doorstates2i = [
        -1, D_ISOPEN, D_CLOSED, D_LOCKED, D_NODOOR, D_BROKEN, D_SECRET,
    ];
    let msk;
    let x, y;
    const argc = args.length;

    if (argc === 3) {
        msk = doorstates2i[luaL_checkoption(args[0], 'random', doorstates)];
        x = luaL_checkinteger(args[1]);
        y = luaL_checkinteger(args[2]);
    } else {
        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        msk = doorstates2i[get_table_option(table, 'state', 'random',
                                            doorstates)];
    }

    const typ = (msk === -1) ? rnddoor(env.random.rn2) : msk;

    if (x === -1 && y === -1) {
        const walldirs = ['all', 'random', 'north', 'west', 'east', 'south'];
        /* Note that "random" is also W_ANY, because create_door just wants a
         * mask of acceptable walls */
        const walldirs2i = [W_ANY, W_ANY, W_NORTH, W_WEST, W_EAST, W_SOUTH, 0];
        // C reads pos and wall from the table at the top of the Lua stack,
        // which the positional form does not leave there.
        const table = lcheck_param_table(args);
        const tmpd = {
            secret: (typ === D_SECRET) ? 1 : 0,
            mask: msk,
            pos: get_table_int_opt(table, 'pos', -1),
            wall: walldirs2i[get_table_option(table, 'wall', 'all',
                                              walldirs)],
        };

        // Every des.door() caller awaits the result, so create_door()'s
        // impossible() prints at C's point in the level program.
        return create_door(tmpd, coder.croom, env.random.rn2,
            impossible_printer(state));
    } else {
        const c = { x, y };
        get_location_coord(c, ANY_LOC, coder.croom, SP_COORD_PACK(x, y),
                           { frame, state });
        if (!isok(c.x, c.y))
            nhl_error(env.lua, 'door coord not ok');
        sel_set_door(c.x, c.y, typ, frame, state);
    }
}

// C ref: sp_lev.c l_table_getset_feature_flag(). Sets or clears one flag
// bit of a feature square from an optional boolean field. Its caller,
// lspo_feature(), is not ported yet.
export function l_table_getset_feature_flag(table, x, y, name, flag, env) {
    let val = get_table_boolean_opt(table, name, -2);

    if (val !== -2) {
        if (val === -1)
            val = env.random.rn2(2);
        const loc = env.state.level.at(x, y);
        if (val)
            loc.flags |= flag;
        else
            loc.flags &= ~flag;
    }
}

// C ref: sp_lev.c cvt_to_abscoord(). Converts a coordinate relative to the
// current room, or otherwise to the map frame, into an absolute one. Unlike
// get_location(), it accepts negative input. `env.coder` is gc.coder and
// `env.frame` holds gx.xstart/gy.ystart.
export function cvt_to_abscoord(c, env) {
    if (env.coder && env.coder.croom) {
        c.x += env.coder.croom.lx;
        c.y += env.coder.croom.ly;
    } else {
        c.x += env.frame.xstart;
        c.y += env.frame.ystart;
    }
}

// C ref: sp_lev.c cvt_to_relcoord(). The inverse of cvt_to_abscoord().
export function cvt_to_relcoord(c, env) {
    if (env.coder && env.coder.croom) {
        c.x -= env.coder.croom.lx;
        c.y -= env.coder.croom.ly;
    } else {
        c.x -= env.frame.xstart;
        c.y -= env.frame.ystart;
    }
}

// C ref: sp_lev.c nhl_abs_coord(), nhlua.c's nh.abscoord(). Two integers
// answer [x, y]; a table with x and y answers {x, y}. This port has no nh
// table, so nothing calls it yet.
export function nhl_abs_coord(args, env) {
    const argc = args.length;
    const c = { x: -1, y: -1 };

    if (argc === 2) {
        c.x = lua_tointeger(args[0]);
        c.y = lua_tointeger(args[1]);
        cvt_to_abscoord(c, env);
        return [c.x, c.y];
    } else if (argc === 1 && isLuaTable(args[0])) {
        c.x = get_table_int(args[0], 'x');
        c.y = get_table_int(args[0], 'y');
        cvt_to_abscoord(c, env);
        return { x: c.x, y: c.y };
    }
    throw new Error('nhl_abs_coord: Wrong args');
}

// C ref: nhlsel.c l_selection_check(), which answers the selection a des.*
// argument holds or raises "Selection error". C selections hold map
// coordinates; this port's relative selections hold Lua-relative ones (see
// ThemeroomSelection.absolute in themerooms.js), so a relative one is
// answered as a copy shifted to the map frame, the conversion sp_lev.c
// get_location() makes when a relative coordinate is used. Squares that
// leave the map are dropped, as selection_setpoint() drops them.
function l_selection_check(value, frame) {
    if (!(value instanceof ThemeroomSelection))
        throw new Error('Selection error');
    if (value.absolute)
        return value;
    const origin = value.origin ?? frame;
    const sel = new ThemeroomSelection(null, true);
    const b = value.bounds();
    for (let x = b.lx; x <= b.hx; ++x)
        for (let y = b.ly; y <= b.hy; ++y)
            if (value.get(x, y))
                sel.set(origin.xstart + x, origin.ystart + y, true);
    return sel;
}

// C ref: sp_lev.c lspo_feature(). feature("name"), feature("name", {x, y}),
// feature("name", x, y), or the table form with type and x/y or coord,
// which alone may carry the feature's flag fields. A random square is a
// DRY one; a given square is taken as is. The flags are set only when the
// square took the feature.
export function lspo_feature(args, env) {
    const { state, coder, frame } = env;
    const features = ['fountain', 'sink', 'pool', 'throne', 'tree'];
    const features2i = [FOUNTAIN, SINK, POOL, THRONE, TREE, STONE];
    let x, y;
    let typ;
    const argc = args.length;
    let can_have_flags = false;
    let fcoord;
    let humidity;
    let table = null;

    if (argc === 1 && typeof args[0] === 'string') {
        typ = features2i[luaL_checkoption(args[0], null, features)];
        x = y = -1;
    } else if (argc === 2 && typeof args[0] === 'string'
               && isLuaTable(args[1])) {
        const c = { x: -1, y: -1 };
        typ = features2i[luaL_checkoption(args[0], null, features)];
        get_coord(args[1], c);
        x = c.x;
        y = c.y;
    } else if (argc === 3) {
        typ = features2i[luaL_checkoption(args[0], null, features)];
        x = luaL_checkinteger(args[1]);
        y = luaL_checkinteger(args[2]);
    } else {
        table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        typ = features2i[get_table_option(table, 'type', null, features)];
        can_have_flags = true;
    }

    if (x === -1 && y === -1) {
        fcoord = SP_COORD_PACK_RANDOM(0);
        humidity = DRY; /* pick a regular space, no rock or other furniture */
    } else {
        fcoord = SP_COORD_PACK(x, y);
        humidity = ANY_LOC; /* assume the author knows what they're doing */
    }
    const c = { x, y };
    get_location_coord(c, humidity, coder.croom, fcoord, { frame, state });
    x = c.x;
    y = c.y;

    if (typ === STONE) {
        // C: impossible("feature has unknown type param.");
        sync_impossible('feature has unknown type param.', state);
    } else {
        sel_set_feature(x, y, typ, state);
    }

    const loc = state.level.at(x, y);
    if (!loc || loc.typ !== typ || !can_have_flags)
        return;

    switch (typ) {
    default:
        break;
    case FOUNTAIN:
        l_table_getset_feature_flag(table, x, y, 'looted', F_LOOTED, env);
        l_table_getset_feature_flag(table, x, y, 'warned', F_WARNED, env);
        break;
    case SINK:
        l_table_getset_feature_flag(table, x, y, 'pudding', S_LPUDDING, env);
        l_table_getset_feature_flag(table, x, y, 'dishwasher', S_LDWASHER,
                                    env);
        l_table_getset_feature_flag(table, x, y, 'ring', S_LRING, env);
        break;
    case THRONE:
        l_table_getset_feature_flag(table, x, y, 'looted', T_LOOTED, env);
        break;
    case TREE:
        l_table_getset_feature_flag(table, x, y, 'looted', TREE_LOOTED, env);
        l_table_getset_feature_flag(table, x, y, 'swarm', TREE_SWARM, env);
        break;
    }
}

// C ref: sp_lev.c lspo_gas_cloud(). gas_cloud({ selection, damage, ttl })
// or the same table with x/y or coord for a one-square cloud. A ttl above
// the -2 default overrides the region's own.
export function lspo_gas_cloud(args, env) {
    const { state, frame } = env;
    let x = 0, y = 0;
    let sel = null;
    const argc = args.length;
    let damage = 0;
    let ttl = -2;

    if (argc === 1 && isLuaTable(args[0])) {
        let reg;

        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        if (x === -1 && y === -1) {
            sel = l_selection_check(table.selection, frame);
        }
        damage = get_table_int_opt(table, 'damage', 0);
        ttl = get_table_int_opt(table, 'ttl', -2);
        if (!sel) {
            // region.c create_gas_cloud() is async for the arrival message
            // it prints outside level creation; it appends its region before
            // its first await, so the newest region is the one it made, and
            // the settled promise is released. The C resolves the square
            // through no frame, and neither does this.
            void create_gas_cloud(x, y, 1, damage, {
                state, random: env.random, hooks: env.hooks,
            });
            reg = state.level.regions[state.level.regions.length - 1];
        } else {
            reg = create_gas_cloud_selection(sel, damage, {
                state, random: env.random, hooks: env.hooks,
            });
        }
        if (ttl > -2)
            reg.ttl = ttl;
    } else {
        throw new Error('wrong parameters');
    }
}

// C ref: sp_lev.c lspo_terrain(). terrain({ x, y | coord | selection, typ,
// lit }), terrain({x, y}, MAPCHAR), terrain(SELECTION, MAPCHAR), or
// terrain(x, y, MAPCHAR). A selection is painted square by square through
// sel_set_ter(); a square is resolved through get_location_coord() and must
// be on the map.
export function lspo_terrain(args, env) {
    const { state, coder, frame } = env;
    const random = env.random?.rn2 ?? rn2;
    const tmpterrain = { tlit: SET_LIT_NOCHANGE, ter: INVALID_TYPE };
    let x = 0, y = 0;
    let sel = null;
    const argc = args.length;

    if (argc === 1) {
        const table = lcheck_param_table(args);

        ({ x, y } = get_table_xy_or_coord(table));
        if (x === -1 && y === -1) {
            sel = l_selection_check(table.selection, frame);
        }
        tmpterrain.ter = get_table_mapchr(table, 'typ');
        tmpterrain.tlit = get_table_int_opt(table, 'lit', SET_LIT_NOCHANGE);
    } else if (argc === 2 && isLuaTable(args[0])
               && !(args[0] instanceof ThemeroomSelection)
               && typeof args[1] === 'string') {
        const c = { x: -1, y: -1 };
        tmpterrain.ter = check_mapchr(luaL_checkstring(args[1]));
        get_coord(args[0], c);
        x = c.x;
        y = c.y;
    } else if (argc === 2) {
        sel = l_selection_check(args[0], frame);
        tmpterrain.ter = check_mapchr(luaL_checkstring(args[1]));
    } else if (argc === 3) {
        x = luaL_checkinteger(args[0]);
        y = luaL_checkinteger(args[1]);
        tmpterrain.ter = check_mapchr(luaL_checkstring(args[2]));
    } else {
        throw new Error('wrong parameters');
    }

    if (tmpterrain.ter === INVALID_TYPE)
        throw new Error('Erroneous map char');

    if (sel) {
        selection_iterate(sel, (sx, sy) => {
            sel_set_ter(
                sx, sy, tmpterrain.ter, tmpterrain.tlit, state, frame, random,
            );
        });
    } else {
        const c = { x, y };
        get_location_coord(c, ANY_LOC, coder.croom, SP_COORD_PACK(x, y),
                           { frame, state });
        if (!isok(c.x, c.y))
            nhl_error(env.lua, 'terrain coord not ok');
        sel_set_ter(
            c.x, c.y, tmpterrain.ter, tmpterrain.tlit, state, frame, random,
        );
    }
}

// C ref: sp_lev.c lspo_replace_terrain(). The area is x1/y1/x2/y2, else
// region, else selection, else the whole map; the match is fromterrain, or
// a mapfragment when that is absent. Each selected square that matches
// draws rn2(100) against chance and is rewritten with set_levltyp_lit().
export function lspo_replace_terrain(args, env) {
    const { state, coder, frame } = env;
    let mf = null;
    let sel = null;
    let x, y;

    const table = lcheck_param_table(args);

    const totyp = get_table_mapchr(table, 'toterrain');

    if (totyp >= MAX_TYPE)
        return;

    const fromtyp = get_table_mapchr_opt(table, 'fromterrain', INVALID_TYPE);

    if (fromtyp === INVALID_TYPE) {
        const tmpstr = get_table_str(table, 'mapfragment');
        mf = mapfrag_fromstr(tmpstr);

        const err = mapfrag_error(mf);
        if (err != null)
            throw new Error(err);
    }

    const chance = get_table_int_opt(table, 'chance', 100);
    const tolit = get_table_int_opt(table, 'lit', SET_LIT_NOCHANGE);
    const r = {
        x1: get_table_int_opt(table, 'x1', -1),
        y1: get_table_int_opt(table, 'y1', -1),
        x2: get_table_int_opt(table, 'x2', -1),
        y2: get_table_int_opt(table, 'y2', -1),
    };
    const noArea = () => (r.x1 === -1 && r.y1 === -1
                          && r.x2 === -1 && r.y2 === -1);

    if (noArea()) {
        get_table_region(table, 'region', r, true);
    }

    if (noArea()) {
        if (table.selection != null)
            sel = l_selection_check(table.selection, frame);
    }

    if (!sel) {
        sel = new ThemeroomSelection(null, true);

        if (noArea()) {
            // C: selection_clear(sel, 1), every square of the map.
            for (x = 0; x < COLNO; x++)
                for (y = 0; y < ROWNO; y++)
                    sel.set(x, y, true);
        } else {
            const c1 = { x: r.x1, y: r.y1 };
            const c2 = { x: r.x2, y: r.y2 };
            get_location(c1, ANY_LOC, coder.croom, { frame, state });
            get_location(c2, ANY_LOC, coder.croom, { frame, state });
            for (x = Math.max(c1.x, 0); x <= Math.min(c2.x, COLNO - 1); x++)
                for (y = Math.max(c1.y, 0); y <= Math.min(c2.y, ROWNO - 1);
                     y++)
                    sel.set(x, y, true);
        }
    }

    const rect = sel.bounds();

    for (x = Math.max(1, rect.lx); x <= rect.hx; x++)
        for (y = rect.ly; y <= rect.hy; y++)
            if (sel.get(x, y)) {
                if (mf) {
                    if (mapfrag_match(mf, x, y, state) && rn2(100) < chance)
                        set_levltyp_lit(x, y, totyp, tolit, state);
                } else {
                    const typ = state.level.at(x, y).typ;
                    if (((fromtyp === MATCH_WALL && IS_STWALL(typ))
                         || typ === fromtyp)
                        && rn2(100) < chance)
                        set_levltyp_lit(x, y, totyp, tolit, state);
                }
            }

    mapfrag_free(mf);
}

// C ref: sp_lev.c generate_way_out_method(). Gives the pocket of accessible
// squares around (nx, ny), which `ov` does not reach, a way out: a secret
// door through one wall into `ov`, else a hole or trap door on a level one
// can fall through, else an escape item. The pocket is flooded with the
// check ensure_way_out() installed. Answers whether a way was made.
function generate_way_out_method(nx, ny, ov, env) {
    const { state } = env;
    const escapeitems = [
        PICK_AXE, DWARVISH_MATTOCK, WAN_DIGGING,
        WAN_TELEPORTATION, SCR_TELEPORTATION, RIN_TELEPORTATION,
    ];
    const ov2 = new ThemeroomSelection(null, true);
    let ov3;
    let c;
    const levl = (x, y) => state.level.at(x, y);

    selection_floodfill(ov2, nx, ny, true);
    ov3 = ov2.clone();

    /* try to make a secret door */
    while ((c = ov3.rndcoord(true)).x !== -1) {
        const { x, y } = c;
        if (isok(x + 1, y) && !ov.get(x + 1, y)
            && IS_WALL(levl(x + 1, y).typ)
            && isok(x + 2, y) && ov.get(x + 2, y)
            && ACCESSIBLE(levl(x + 2, y).typ)) {
            levl(x + 1, y).typ = SDOOR;
            return true;
        }
        if (isok(x - 1, y) && !ov.get(x - 1, y)
            && IS_WALL(levl(x - 1, y).typ)
            && isok(x - 2, y) && ov.get(x - 2, y)
            && ACCESSIBLE(levl(x - 2, y).typ)) {
            levl(x - 1, y).typ = SDOOR;
            return true;
        }
        if (isok(x, y + 1) && !ov.get(x, y + 1)
            && IS_WALL(levl(x, y + 1).typ)
            && isok(x, y + 2) && ov.get(x, y + 2)
            && ACCESSIBLE(levl(x, y + 2).typ)) {
            levl(x, y + 1).typ = SDOOR;
            return true;
        }
        if (isok(x, y - 1) && !ov.get(x, y - 1)
            && IS_WALL(levl(x, y - 1).typ)
            && isok(x, y - 2) && ov.get(x, y - 2)
            && ACCESSIBLE(levl(x, y - 2).typ)) {
            levl(x, y - 1).typ = SDOOR;
            return true;
        }
    }

    /* try to make a hole or a trapdoor */
    if (Can_fall_thru(state.u.uz, state)) {
        ov3 = ov2.clone();
        while ((c = ov3.rndcoord(true)).x !== -1) {
            if (maketrap(c.x, c.y, rn2(2) ? HOLE : TRAPDOOR, env))
                return true;
        }
    }

    /* generate one of the escape items */
    if ((c = ov2.rndcoord(false)).x !== -1) {
        mksobj_at(escapeitems[rn2(escapeitems.length)], c.x, c.y, true,
                  false, levelObjectEnv());
        return true;
    }

    return false;
}

// C ref: sp_lev.c ensure_way_out(). Floods the squares reachable from every
// stairway of this dungeon and from every undestroyable trap or hole, then
// gives each accessible square left outside a way out, flooding from it
// when one was made, until none is left. Called by load_special() when the
// level asked for "inaccessibles".
function ensure_way_out(env) {
    const { state } = env;
    const ov = new ThemeroomSelection(null, true);
    let ret = true;

    set_selection_floodfillchk(
        (x, y) => floodfillchk_match_accessible(x, y, state),
    );

    for (let stway = state.stairs; stway; stway = stway.next) {
        if (stway.tolev.dnum === state.u.uz.dnum)
            selection_floodfill(ov, stway.sx, stway.sy, true);
    }

    for (const ttmp of state.level.traps) {
        if ((undestroyable_trap(ttmp.ttyp) || is_hole(ttmp.ttyp))
            && !ov.get(ttmp.tx, ttmp.ty))
            selection_floodfill(ov, ttmp.tx, ttmp.ty, true);
    }

    do {
        ret = true;
        outhere:
        for (let x = 1; x < COLNO; x++)
            for (let y = 0; y < ROWNO; y++)
                if (ACCESSIBLE(state.level.at(x, y).typ)
                    && !ov.get(x, y)) {
                    if (generate_way_out_method(x, y, ov, env))
                        selection_floodfill(ov, x, y, true);
                    ret = false;
                    break outhere;
                }
    } while (!ret);
}

// C ref: sp_lev.c levregion_add(). Resolves each area that is not already
// in level coordinates through get_location() with no room, and appends
// the record to gl.lregions (the port's state.lregions), which
// fixup_special() consumes in finish().
function levregion_add(lregion, env) {
    const { state, frame } = env;
    if (!lregion.in_islev) {
        const c1 = { x: lregion.inarea.x1, y: lregion.inarea.y1 };
        const c2 = { x: lregion.inarea.x2, y: lregion.inarea.y2 };
        get_location(c1, ANY_LOC, null, { frame, state });
        get_location(c2, ANY_LOC, null, { frame, state });
        lregion.inarea = { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y };
    }

    if (!lregion.del_islev) {
        const c1 = { x: lregion.delarea.x1, y: lregion.delarea.y1 };
        const c2 = { x: lregion.delarea.x2, y: lregion.delarea.y2 };
        get_location(c1, ANY_LOC, null, { frame, state });
        get_location(c2, ANY_LOC, null, { frame, state });
        lregion.delarea = { x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y };
    }
    // C reallocates the array one record longer, or allocates it for the
    // first record, and copies the new record in.
    (state.lregions ??= []).push({ ...lregion });
}

// C ref: sp_lev.c l_get_lregion(). Reads region, the optional exclude,
// and the two _islev flags of a levregion/teleport_region table. Without
// an exclude, exclude_islev is forced on so the -1,-1,-1,-1 area stays off
// the map.
export function l_get_lregion(table, tmplregion) {
    const r = { x1: 0, y1: 0, x2: 0, y2: 0 };

    get_table_region(table, 'region', r, false);
    tmplregion.inarea = { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };

    r.x1 = r.y1 = r.x2 = r.y2 = -1;
    get_table_region(table, 'exclude', r, true);
    tmplregion.delarea = { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };

    tmplregion.in_islev = get_table_boolean_opt(table, 'region_islev', 0);
    tmplregion.del_islev = get_table_boolean_opt(table, 'exclude_islev', 0);

    /* if x1 is still negative, exclude wasn't specified, so we should treat
     * it as if there is no exclude region at all. Force exclude_islev to
     * true so the -1,-1,-1,-1 region is safely off the map and won't
     * interfere with branch or portal placement. */
    if (r.x1 < 0)
        tmplregion.del_islev = true;
}

// C ref: sp_lev.c lspo_teleport_region(). teleport_region({ region,
// [region_islev,] [exclude, [exclude_islev,]] [dir] }); dir defaults to
// both. The record's rname is the C's rname.str.
export function lspo_teleport_region(args, env) {
    const teledirs = ['both', 'down', 'up'];
    const teledirs2i = [LR_TELE, LR_DOWNTELE, LR_UPTELE, -1];
    const tmplregion = {};

    const table = lcheck_param_table(args);
    l_get_lregion(table, tmplregion);
    tmplregion.rtype = teledirs2i[get_table_option(table, 'dir', 'both',
                                                   teledirs)];
    tmplregion.padding = 0;
    tmplregion.rname = null;

    levregion_add(tmplregion, env);
}

// C ref: sp_lev.c lspo_levregion(). levregion({ region, exclude, type,
// name, padding }); type defaults to stair-down.
export function lspo_levregion(args, env) {
    const regiontypes = [
        'stair-down', 'stair-up', 'portal', 'branch',
        'teleport', 'teleport-up', 'teleport-down',
    ];
    const regiontypes2i = [
        LR_DOWNSTAIR, LR_UPSTAIR, LR_PORTAL, LR_BRANCH,
        LR_TELE, LR_UPTELE, LR_DOWNTELE, 0,
    ];
    const tmplregion = {};

    const table = lcheck_param_table(args);
    l_get_lregion(table, tmplregion);
    tmplregion.rtype = regiontypes2i[get_table_option(table, 'type',
                                                      'stair-down',
                                                      regiontypes)];
    tmplregion.padding = get_table_int_opt(table, 'padding', 0);
    tmplregion.rname = get_table_str_opt(table, 'name', null);

    levregion_add(tmplregion, env);
}

// C ref: sp_lev.c lspo_exclusion(). exclusion({ type, region }); the
// corners go through get_location_coord() with the current room, and the
// zone is pushed onto sve.exclusion_zones (the port's
// state.exclusion_zones).
export function lspo_exclusion(args, env) {
    const { state, frame } = env;
    const ez_types = [
        'teleport', 'teleport-up', 'teleport-down', 'monster-generation',
    ];
    const ez_types2i = [LR_TELE, LR_UPTELE, LR_DOWNTELE, LR_MONGEN, 0];
    const ez = {};
    const r = { x1: 0, y1: 0, x2: 0, y2: 0 };

    const table = lcheck_param_table(args);
    ez.zonetype = ez_types2i[get_table_option(table, 'type', 'teleport',
                                              ez_types)];
    get_table_region(table, 'region', r, false);

    const a = { x: r.x1, y: r.y1 };
    const b = { x: r.x2, y: r.y2 };

    const croom = env.coder?.croom ?? null;
    get_location_coord(a, ANY_LOC | NO_LOC_WARN, croom,
                       SP_COORD_PACK(a.x, a.y), { frame, state });
    get_location_coord(b, ANY_LOC | NO_LOC_WARN, croom,
                       SP_COORD_PACK(b.x, b.y), { frame, state });

    ez.lx = a.x;
    ez.ly = a.y;
    ez.hx = b.x;
    ez.hy = b.y;

    ez.next = state.exclusion_zones ?? null;
    state.exclusion_zones = ez;
}

// C ref: sp_lev.c sel_set_lit(). Lights or darkens one square; lava is
// always lit.
function sel_set_lit(x, y, lit, state) {
    const loc = state.level.at(x, y);

    loc.lit = Boolean(IS_LAVA(loc.typ) || lit);
}

// C ref: sp_lev.c get_table_coords_or_region(). Reads x1/y1/x2/y2 into `d`,
// or, when all four are absent, the required region field.
export function get_table_coords_or_region(table, d) {
    d.x1 = get_table_int_opt(table, 'x1', -1);
    d.y1 = get_table_int_opt(table, 'y1', -1);
    d.x2 = get_table_int_opt(table, 'x2', -1);
    d.y2 = get_table_int_opt(table, 'y2', -1);

    if (d.x1 === -1 && d.y1 === -1 && d.x2 === -1 && d.y2 === -1) {
        const r = { x1: 0, y1: 0, x2: 0, y2: 0 };

        get_table_region(table, 'region', r, false);
        d.x1 = r.x1;
        d.y1 = r.y1;
        d.x2 = r.x2;
        d.y2 = r.y2;
    }
}

// C ref: sp_lev.c lspo_region(). region(selection, "lit"|"unlit") clones
// the selection, grows it when lit, and sets each square's lighting. The
// table form, with x1/y1/x2/y2 or region and lit, type, joined, irregular,
// filled, arrival_room, and contents, lights a plain rectangle through
// light_region() and otherwise makes a room: flood-filled from its first
// corner when irregular, else add_room() plus topologize(). The room
// becomes the current room for its contents callback, is left through
// spo_endroom(), and gets its doors from add_doors_to_room().
export function lspo_region(args, env) {
    const { state, coder, frame } = env;
    const d = { x1: 0, y1: 0, x2: 0, y2: 0 };
    let troom;
    let do_arrival_room = false, room_not_needed,
        irregular = false, joined = true;
    let rtype = OROOM, rlit = 1, needfill = 0;
    const argc = args.length;
    let table = null;

    if (argc <= 1) {
        table = lcheck_param_table(args);

        /* TODO: "unfilled" => filled=0, "filled" => filled=1, and
         * "lvflags_only" => filled=2, probably in a get_table_needfill_opt */
        needfill = get_table_int_opt(table, 'filled', 0);
        irregular = get_table_boolean_opt(table, 'irregular', 0);
        joined = get_table_boolean_opt(table, 'joined', true);
        do_arrival_room = get_table_boolean_opt(table, 'arrival_room', 0);
        rtype = get_table_roomtype_opt(table, 'type', OROOM, env);
        rlit = get_table_int_opt(table, 'lit', -1);

        get_table_coords_or_region(table, d);

        if (d.x1 === -1 && d.y1 === -1 && d.x2 === -1 && d.y2 === -1) {
            throw new Error('region needs region');
        }

    } else if (argc === 2) {
        /* region(selection, "lit"); */
        const lits = ['unlit', 'lit'];
        const orig = l_selection_check(args[0], frame);
        let sel = orig.clone();

        rlit = luaL_checkoption(args[1], 'lit', lits);

        /*
    TODO: lit=random
        */
        // selvar.c selection_do_grow() grows in place; the port's grow()
        // answers the grown copy.
        if (rlit)
            sel = sel.grow(W_ANY);
        selection_iterate(sel, (x, y) => sel_set_lit(x, y, rlit, state));

        /* TODO: skip the rest of this function? */
        return;
    } else {
        throw new Error('Wrong parameters');
    }

    rlit = litstate_rnd(rlit);

    const c1 = { x: d.x1, y: d.y1 };
    const c2 = { x: d.x2, y: d.y2 };
    get_location(c1, ANY_LOC, null, { frame, state });
    get_location(c2, ANY_LOC, null, { frame, state });
    d.x1 = c1.x;
    d.y1 = c1.y;
    d.x2 = c2.x;
    d.y2 = c2.y;

    /* Many regions are simple, rectangular areas that just need to set
     * lighting in an area. In that case, we don't need to do anything
     * complicated by creating a room. The exceptions are:
     *  - Special rooms (which usually need to be filled).
     *  - Irregular regions (more convenient to use the room-making code).
     *  - Themed room regions (which often have contents).
     *  - When a room is desired to constrain the arrival of migrating
     *    monsters (see the mon_arrive function for details).
     */
    room_not_needed = (rtype === OROOM && !irregular
                       && !do_arrival_room && !state.in_mk_themerooms);
    if (room_not_needed || state.level.nroom >= MAXNROFROOMS) {
        if (!room_not_needed) {
            // C: impossible("Too many rooms on new level!");
            sync_impossible('Too many rooms on new level!', state);
        }
        light_region({
            rlit, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
        }, state);

        return;
    }

    // C writes needfill and needjoining into svr.rooms[svn.nroom] before
    // add_room() fills the rest of that record and leaves those two alone
    // for a special room. The port's add_room() makes the record, so the
    // two are written once it exists.
    const roomFields = (room) => {
        /* mark rooms that must be filled, but do it later */
        room.needfill = needfill;

        room.needjoining = joined;
    };

    if (irregular) {
        state._mkmap_min_rx = state._mkmap_max_rx = d.x1;
        state._mkmap_min_ry = state._mkmap_max_ry = d.y1;
        state.smeq[state.level.nroom] = state.level.nroom;
        flood_fill_rm(d.x1, d.y1, state.level.nroom + ROOMOFFSET, rlit,
                      true, state);
        add_room(state._mkmap_min_rx, state._mkmap_min_ry,
                 state._mkmap_max_rx, state._mkmap_max_ry, false, rtype,
                 true);
        troom = state.level.rooms[state.level.nroom - 1];
        roomFields(troom);
        troom.rlit = rlit;
        troom.irregular = true;
    } else {
        add_room(d.x1, d.y1, d.x2, d.y2, rlit, rtype, true);
        troom = state.level.rooms[state.level.nroom - 1];
        roomFields(troom);
        topologize(troom, state); /* set roomno */
    }

    if (!room_not_needed) {
        if (coder.n_subroom > 1) {
            // C: impossible("region as subroom");
            sync_impossible('region as subroom', state);
        } else {
            coder.tmproomlist[coder.n_subroom] = troom;
            coder.failed_room[coder.n_subroom] = false;
            coder.n_subroom++;
            update_croom(coder);
            const finishRegion = () => {
                spo_endroom(coder, frame, state);
                add_doors_to_room(troom);
                return;
            };
            if (typeof table.contents === 'function') {
                const maybeContents = table.contents(
                    l_push_mkroom_table(troom),
                );
                if (maybeContents && typeof maybeContents.then === 'function')
                    return maybeContents.then(finishRegion);
            }
            return finishRegion();
        }
    }
}

// C ref: sp_lev.c lspo_drawbridge(). The table form with x/y or coord, a
// dir of north/south/west/east/random, and a state of open/closed/random.
// A random state draws rn2(2) once the square is resolved; the bridge and
// its wall come from dbridge.c create_drawbridge(). The coordinate check
// reads the Lua values before conversion, as the source does.
export function lspo_drawbridge(args, env) {
    const { state, coder, frame } = env;
    const mwdirs = ['north', 'south', 'west', 'east', 'random'];
    const mwdirs2i = [DB_NORTH, DB_SOUTH, DB_WEST, DB_EAST, -1, -2];
    const dbopens = ['open', 'closed', 'random'];
    const dbopens2i = [1, 0, -1, -2];

    const table = lcheck_param_table(args);

    const { x: mx, y: my } = get_table_xy_or_coord(table);

    const dir = mwdirs2i[get_table_option(table, 'dir', 'random', mwdirs)];
    const dcoord = SP_COORD_PACK(mx, my);
    let db_open = dbopens2i[get_table_option(table, 'state', 'random',
                                             dbopens)];
    const c = { x: mx, y: my };

    get_location_coord(c, DRY | WET | HOT, coder.croom, dcoord,
                       { frame, state });
    if (!isok(mx, my)) {
        nhl_error(env.lua, 'drawbridge coord not ok');
    }
    if (db_open === -1)
        db_open = rn2(2) ? 0 : 1;
    if (!create_drawbridge(c.x, c.y, dir, Boolean(db_open), state)) {
        // C: impossible("Cannot create drawbridge.");
        sync_impossible('Cannot create drawbridge.', state);
    }
    frame.splevMap[c.x][c.y] = 1;
}

// C ref: sp_lev.c lspo_mazewalk(). mazewalk(x, y, dir) or the table form
// with x/y or coord, typ, stocked, and dir. Steps one square in the walk
// direction, moves the start onto odd parity, carves from it through
// walkfrom(), and fills the maze through fill_empty_maze() when stocked.
export async function lspo_mazewalk(args, env) {
    const { state, coder, frame } = env;
    const mwdirs = ['north', 'south', 'east', 'west', 'random'];
    const mwdirs2i = [W_NORTH, W_SOUTH, W_EAST, W_WEST, W_RANDOM, -2];
    let mx, my;
    let ftyp = ROOM;
    let fstocked = 1, dir = -1;
    const argc = args.length;

    if (argc === 3) {
        mx = luaL_checkinteger(args[0]);
        my = luaL_checkinteger(args[1]);
        dir = mwdirs2i[luaL_checkoption(args[2], 'random', mwdirs)];
    } else {
        const table = lcheck_param_table(args);

        ({ x: mx, y: my } = get_table_xy_or_coord(table));
        ftyp = get_table_mapchr_opt(table, 'typ', ROOM);
        fstocked = get_table_boolean_opt(table, 'stocked', 1);
        dir = mwdirs2i[get_table_option(table, 'dir', 'random', mwdirs)];
    }

    const mcoord = SP_COORD_PACK(mx, my);
    const c = { x: mx, y: my };

    get_location_coord(c, ANY_LOC, coder.croom, mcoord, { frame, state });
    let { x, y } = c;

    if (!isok(x, y)) {
        nhl_error(env.lua, 'mazewalk coord not ok');
    }

    if (ftyp < 1) {
        ftyp = state.level.flags.corrmaze ? CORR : ROOM;
    }

    if (dir === W_RANDOM)
        dir = random_wdir();

    /* don't use move() - it doesn't use W_NORTH, etc. */
    switch (dir) {
    case W_NORTH:
        --y;
        break;
    case W_SOUTH:
        y++;
        break;
    case W_EAST:
        x++;
        break;
    case W_WEST:
        --x;
        break;
    default:
        await impossible('mazewalk: Bad direction', state);
        break;
    }

    if (!IS_DOOR(state.level.at(x, y).typ)) {
        state.level.at(x, y).typ = ftyp;
        state.level.at(x, y).flags = 0;
    }

    /*
     * We must be sure that the parity of the coordinates for
     * walkfrom() is odd.  But we must also take into account
     * what direction was chosen.
     */
    if (!(x % 2)) {
        if (dir === W_EAST)
            x++;
        else
            x--;

        /* no need for IS_DOOR check; out of map bounds */
        state.level.at(x, y).typ = ftyp;
        state.level.at(x, y).flags = 0;
    }

    if (!(y % 2)) {
        if (dir === W_SOUTH)
            y++;
        else
            y--;
    }

    walkfrom(x, y, ftyp, state);
    if (fstocked)
        await fill_empty_maze(frame, state, env);
}

// C ref: sp_lev.c lspo_wall_property(). A rectangle from x1/y1/x2/y2 or
// region, each absent corner defaulting to the frame plus a one-square
// border, converted through get_location() and flagged nondiggable or
// nonpasswall through set_wall_property().
export function lspo_wall_property(args, env) {
    const { state, frame } = env;
    const wprops = ['nondiggable', 'nonpasswall'];
    const wprop2i = [W_NONDIGGABLE, W_NONPASSWALL, -1];
    const d = { x1: -1, y1: -1, x2: -1, y2: -1 };

    const table = lcheck_param_table(args);

    get_table_coords_or_region(table, d);

    const wprop = wprop2i[get_table_option(table, 'property', 'nondiggable',
                                           wprops)];

    if (d.x1 === -1)
        d.x1 = frame.xstart - 1;
    if (d.y1 === -1)
        d.y1 = frame.ystart - 1;
    if (d.x2 === -1)
        d.x2 = frame.xstart + frame.xsize + 1;
    if (d.y2 === -1)
        d.y2 = frame.ystart + frame.ysize + 1;

    const c1 = { x: d.x1, y: d.y1 };
    const c2 = { x: d.x2, y: d.y2 };
    get_location(c1, ANY_LOC, null, { frame, state });
    get_location(c2, ANY_LOC, null, { frame, state });

    set_wall_property(c1.x, c1.y, c2.x, c2.y, wprop, state);
}

// C ref: sp_lev.c set_wallprop_in_selection(). One argument is the
// selection to flag; none means a fresh selection cleared to 1, so every
// map square is visited. Each square goes through sel_set_wall_property().
// The source frees the fresh selection afterwards; the port leaves it to
// the collector.
function set_wallprop_in_selection(args, env, prop) {
    const { state, frame } = env;
    const argc = args.length;
    let sel = null;

    if (argc === 1) {
        sel = l_selection_check(args[0], frame);
    } else if (argc === 0) {
        sel = selection_new();
        selection_clear(sel, 1);
    }

    if (sel) {
        selection_iterate(sel,
                          (x, y) => sel_set_wall_property(x, y, prop, state));
    }
}

// C ref: sp_lev.c lspo_non_diggable(). non_diggable(selection) or
// non_diggable().
export function lspo_non_diggable(args, env) {
    set_wallprop_in_selection(args, env, W_NONDIGGABLE);
}

// C ref: sp_lev.c lspo_non_passwall(). non_passwall(selection) or
// non_passwall().
export function lspo_non_passwall(args, env) {
    set_wallprop_in_selection(args, env, W_NONPASSWALL);
}

// C ref: sp_lev.c sel_set_wallify(). The source keeps it under `#if 0`
// with no caller: the selection form that lspo_wallify()'s
// "TODO: wallify(selection)" would iterate through it.
export function sel_set_wallify(x, y, arg, state = game) {
    wallify_map(x, y, x, y, state);
}

// C ref: sp_lev.c lspo_wallify(). wallify({ x1, y1, x2, y2 }), whose four
// fields are all required, or wallify(). A negative or absent corner
// defaults to the frame plus a one-square border; wallify_map() walls the
// stone next to the floor inside it.
export function lspo_wallify(args, env) {
    const { state, frame } = env;
    let dx1 = -1, dy1 = -1, dx2 = -1, dy2 = -1;

    /* TODO: clamp coord values */
    /* TODO: maybe allow wallify({x1,y1}, {x2,y2}) */
    /* TODO: is_table_coord(), is_table_area(),
             get_table_coord(), get_table_area() */

    if (args.length === 1) {
        const table = args[0];
        dx1 = get_table_int(table, 'x1');
        dy1 = get_table_int(table, 'y1');
        dx2 = get_table_int(table, 'x2');
        dy2 = get_table_int(table, 'y2');
    }

    wallify_map(dx1 < 0 ? (frame.xstart - 1) : dx1,
                dy1 < 0 ? (frame.ystart - 1) : dy1,
                dx2 < 0 ? (frame.xstart + frame.xsize + 1) : dx2,
                dy2 < 0 ? (frame.ystart + frame.ysize + 1) : dy2,
                state);
}

// C ref: sp_lev.c lspo_reset_level(). "Only needed for testing purposes":
// des.reset_level() in the Lua test scripts, and wizcmds.c
// wiz_load_splua() with no Lua state. Only the Lua caller remakes the coder;
// both mark Lua testing and clear the level for a fresh generation.
export async function lspo_reset_level(args, env) {
    const { state } = env;
    const wtower = await finish_steps(
        In_W_tower_steps(state.u.ux, state.u.uy, state.u.uz, state),
        impossible_printer(state));

    state.iflags ??= {};
    state.iflags.lua_testing = true;
    // C: if (L) { Free(gc.coder); gc.coder = NULL; create_des_coder(); }
    if (args !== null) {
        state.gc.coder = null;
        create_des_coder(state);
    }
    // Dynamic import keeps cmd.c's port in js/cmd.js without adding a static
    // cmd -> do -> mklev -> cmd initialization cycle.
    const { makemap_prepost } = await import('./cmd.js');
    await makemap_prepost(true, wtower, state);
    state.in_mklev = true;
    oinit(state); /* assign level dependent obj probabilities */
    clear_level_structures();
}

// C ref: sp_lev.c lspo_finalize_level(). "Only needed for testing
// purposes": des.finalize_level() in the Lua test scripts, and wizcmds.c
// wiz_load_splua() with no Lua state; that caller's
// L-less arms skip the coder's inaccessibles, flip, solidify, and premap
// steps. The sequence up to premap_detect() is the one load_special() runs in
// finish(); this adds level_finalize_topology() and the special-room
// fills.
export async function lspo_finalize_level(args, env) {
    const { state } = env;
    const frame = sp_lev_frame(state);
    const wtower = await finish_steps(
        In_W_tower_steps(state.u.ux, state.u.uy, state.u.uz, state),
        impossible_printer(state));

    if (args !== null) create_des_coder(state);
    const coder = state.gc?.coder ?? null;

    link_doors_rooms();
    remove_boundary_syms(frame, state);

    /* TODO: ensure_way_out() needs rewrite */
    if (args !== null && coder.check_inaccessibles)
        await printQueued(ensure_way_out(env));

    map_cleanup(state);

    /* FIXME: Ideally, we want this call to only cover areas of the map
     * which were not inserted directly by the special level file (see
     * the insect legs on Baalzebub's level, for instance). Since that
     * is currently not possible, we overload the corrmaze flag for this
     * purpose.
     */
    if (!state.level.flags.corrmaze)
        wallification(1, 0, COLNO - 1, ROWNO - 1, state);

    if (args !== null) await flip_level_rnd(coder.allow_flips, false, state);

    count_level_features(state);

    if (args !== null && coder.solidify)
        solidify_map(state, frame);

    /* This must be done before premap_detect(),
     * otherwise branch stairs won't be premapped. */
    await finishFixupSpecial(state);

    if (args !== null && coder.premapped)
        await printQueued(premap_detect(state));

    level_finalize_topology();

    for (let i = 0; i < state.level.nroom; ++i) {
        await printQueued(fill_special_room(state.level.rooms[i], levelObjectEnv()));
    }

    const { makemap_prepost } = await import('./cmd.js');
    await makemap_prepost(false, wtower, state);
    state.iflags ??= {};
    state.iflags.lua_testing = false;
}


async function finishFixupSpecial(state) {
    await fixup_special(state, {
        findLevel: find_level,
        isMedusaLevel: Is_medusa_level,
        somex: (room) => somex(room, { state }),
        somey: (room) => somey(room, { state }),
        goodpos,
        levelObjectEnv,
        mkTtObject: (x, y, env) => mk_tt_object(STATUE, x, y, env),
        mkCorpstat: (x, y, env) => mkcorpstat(
            STATUE, null, null, x, y, CORPSTAT_NONE, env,
        ),
        badStatueSpecies: (mnum, currentState) =>
            poly_when_stoned(currentState.mons[mnum], currentState)
                || pm_resistance(currentState.mons[mnum], MR_STONE),
        setCorpsenm: set_corpsenm,
        rndmonnum,
    });
}

const SPECIAL_LEVEL_LUA_GLOBALS = Symbol('special-level Lua globals');

// `lua` is the level program's Lua state: nhlL_newstate()'s nud and, while
// its main chunk runs, the Lua stack (js/nhlua.js luaFrames()).
export function createSpecialLevelApi(state, lua) {
    // sp_lev.c's file-scope state (sp_lev_frame()). SpLev_Map tracks which
    // cells lspo_map, lspo_door, lspo_stair, or lspo_drawbridge placed;
    // maze1xy avoids them when placing fill objects. The frame's
    // xstart/ystart/xsize/ysize are set by reset_xystart_size() from
    // sp_level_coder_init(); des.map() overrides them with the map's
    // placement, and map-less levels keep the whole-map defaults.
    const frame = sp_lev_frame(state);
    const spObjectContext = new_sp_lev_object_context();
    // The C globals the des.* functions read: svl.level through `state`,
    // gc.coder, and sp_lev.c's file-scope placement state through `frame`.
    const env = {
        state,
        random: coreRandom,
        // A des.* call prints impossible() where C does: every caller of
        // these functions awaits them (js/sp_lev_object.js returns the
        // promise through create_object()).
        hooks: objectGenerationHooks({
            impossible: (message) => impossible(message, state),
        }),
        frame,
        // gc.coder as it is now: each des.* call creates it first (below).
        get coder() { return state.gc?.coder ?? null; },
        spObjectContext,
        lua,
    };

    const des = l_register_des({
        random: coreRandom,
        get frame() { return frame; },

        level_init(...args) { return lspo_level_init(args, env); },

        message(...args) { return lspo_message(args, env); },

        level_flags(...args) { return lspo_level_flags(args, env); },

        mineralize(...args) { return lspo_mineralize(args, env); },

        // C ref: sp_lev.c lspo_map(). The array form is the source's
        // string form (centered, no contents); the table form places the
        // fragment at halign/valign or at a given square, runs its contents
        // with the {width, height} table, and then resets the frame.
        map(rowsOrSpec) {
            if (Array.isArray(rowsOrSpec)) {
                return mapFromRows(rowsOrSpec, frame, state);
            }
            const spec = rowsOrSpec;
            const mapText = spec.map;
            // C lspo_map() reads this field through the Lua boolean reader.
            const lit = get_table_boolean_opt(spec, 'lit', 0);
            const mf = mapfrag_fromstr(mapText);
            const has_contents = typeof spec.contents === 'function';
            if (!mf) throw new Error('Map data error');
            // sp_lev.c:lspo_map returns the selection of cells it wrote,
            // including neither transparent nor invalid fragment cells.
            const selection = new ThemeroomSelection(null, true);

            // C ref: sp_lev.c lspo_map() l_or_r2i[]/t_or_b2i[]: an absent
            // alignment is "none" (-1), which leaves that axis's start as it
            // was; only both absent makes the call a placement at x,y.
            // C's explicit "none" option is the same -1 sentinel as omission.
            const lr = spec.halign == null || spec.halign === 'none'
                ? -1 : spec.halign;
            const tb = spec.valign == null || spec.valign === 'none'
                ? -1 : spec.valign;
            frame.xsize = mf.wid;
            frame.ysize = mf.hei;
            if (lr === -1 && tb === -1) {
                // C ref: sp_lev.c:6162-6175. An explicit square is a map
                // coordinate; inside a room it is room-relative and the
                // fragment is clipped to the room.
                const [x, y] = (spec.x != null || spec.y != null)
                    ? [spec.x ?? -1, spec.y ?? -1]
                    : (spec.coord ?? [-1, -1]);
                if (!isok(x, y)) {
                    mapfrag_free(mf);
                    throw new Error(
                        'Map requires either x,y or halign,valign params',
                    );
                }
                const { croom } = env.coder;
                if (croom) {
                    frame.xstart = x + croom.lx;
                    frame.ystart = y + croom.ly;
                    frame.xsize = Math.min(mf.wid, (croom.hx - croom.lx));
                    frame.ysize = Math.min(mf.hei, (croom.hy - croom.ly));
                } else {
                    frame.xstart = x;
                    frame.ystart = y;
                }
            } else {
                // C ref: sp_lev.c lspo_map() halign/valign placement.
                // Aligns the map fragment within the maze area.
                if (lr !== -1)
                    frame.xstart = mapAlignX(lr, mf.wid, frame);
                if (tb !== -1)
                    frame.ystart = mapAlignY(tb, mf.hei, frame);
                if (!(frame.xstart % 2)) frame.xstart++;
                if (!(frame.ystart % 2)) frame.ystart++;
            }
            // C ref: sp_lev.c:6227-6238 overflow adjustment.
            if (frame.ystart < 0 || frame.ystart + frame.ysize > ROWNO) {
                frame.ystart += (frame.ystart > 0) ? -2 : 2;
                if (frame.ysize === ROWNO) frame.ystart = 0;
                if (frame.ystart < 0 || frame.ystart + frame.ysize > ROWNO)
                    frame.ystart = 0;
            }
            state.xstart = frame.xstart;
            state.ystart = frame.ystart;
            state.xsize = frame.xsize;
            state.ysize = frame.ysize;
            if (frame.xsize <= 1 && frame.ysize <= 1) {
                reset_xystart_size(frame, state);
            } else {
                /* Load the map */
                for (let y = frame.ystart;
                     y < Math.min(ROWNO, frame.ystart + frame.ysize); y++)
                    for (let x = frame.xstart;
                         x < Math.min(COLNO, frame.xstart + frame.xsize); x++) {
                        const mptyp = mapfrag_get(mf, x - frame.xstart,
                                                  y - frame.ystart);
                        if (mptyp === INVALID_TYPE) continue;
                        if (mptyp >= MAX_TYPE) continue;
                        set_themeroom_map_terrain(x, y, mptyp, state, lit, frame);
                        frame.splevMap[x][y] = 1;
                        selection.set(x, y);
                    }
            }
            mapfrag_free(mf);

            const placed = {
                xstart: frame.xstart, ystart: frame.ystart,
                xsize: frame.xsize, ysize: frame.ysize,
                selection,
            };
            if (has_contents) {
                const maybeContents = spec.contents(
                    l_push_wid_hei_table(frame.xsize, frame.ysize),
                );
                const finishContents = () => {
                    reset_xystart_size(frame, state);
                    return placed;
                };
                if (maybeContents && typeof maybeContents.then === 'function')
                    return maybeContents.then(finishContents);
                return finishContents();
            }
            return placed;
        },

        region(...args) { return lspo_region(args, env); },

        non_diggable(...args) { return lspo_non_diggable(args, env); },

        non_passwall(...args) { return lspo_non_passwall(args, env); },

        wall_property(...args) { return lspo_wall_property(args, env); },

        exclusion(...args) { return lspo_exclusion(args, env); },

        teleport_region(...args) {
            return lspo_teleport_region(args, env);
        },

        parse_config(name, enabled) {
            state.flags ??= {};
            state.flags[name] = Boolean(enabled);
        },

        engraving(...args) { return lspo_engraving(args, env); },

        door(...args) { return lspo_door(args, env); },

        trap(...args) { return lspo_trap(args, env); },

        drawbridge(...args) { return lspo_drawbridge(args, env); },

        // C ref: sp_lev.c lspo_object() argument forms: object("sack"),
        // object("scimitar", 6, 7), object("scimitar", {6, 7}), and the
        // table form. A one-character string is an object class; a longer
        // one is an object name for find_objtype(). The descriptor keeps
        // map-relative coordinates until sp_lev_object.js consumes the
        // frame, so no offset is applied here.
        object(...args) {
            const argc = args.length;
            const objectParamstr = (paramstr) => (paramstr.length === 1
                ? { class: def_char_to_objclass(paramstr) }
                : { id: find_objtype(paramstr, -1, state) });
            let spec;
            if (argc === 1 && typeof args[0] === 'string') {
                spec = objectParamstr(luaL_checkstring(args[0]));
            } else if (argc === 2 && typeof args[0] === 'string'
                       && args[1] != null && typeof args[1] === 'object') {
                const c = { x: -1, y: -1 };
                get_coord(args[1], c);
                spec = { ...objectParamstr(luaL_checkstring(args[0])), ...c };
            } else if (argc === 3 && typeof args[1] === 'number'
                       && typeof args[2] === 'number') {
                spec = {
                    ...objectParamstr(luaL_checkstring(args[0])),
                    x: luaL_checkinteger(args[1]),
                    y: luaL_checkinteger(args[2]),
                };
            } else {
                spec = lcheck_param_table(args);
            }
            // C ref: sp_lev.c lspo_object(): only these object types read
            // montype. Species names use the source table directly, without
            // find_montype's gender draw; non-species tokens stay with the
            // canonical normalization in sp_lev_object.js.
            const hasMontype = spec.montype != null;
            const id = hasMontype ? get_table_objtype(spec, state) : spec.id;
            let corpsenm;
            if ([STATUE, EGG, CORPSE, TIN, FIGURINE].includes(id)) {
                // Existing translated loaders may supply the resolved PM index.
                const montype = Number.isInteger(spec.montype) ? spec.montype
                    : get_table_str_opt(spec, 'montype', null);
                if (Number.isInteger(montype)) corpsenm = montype;
                const token = typeof montype === 'string' ? lcase(montype) : null;
                const nonpmobj = (id === TIN && (token === 'spinach' || token === 'empty'))
                    || (id === EGG && token === 'empty');
                if (token != null && !nonpmobj) {
                    let species;
                    const cls = montype.length === 1 ? def_char_to_monclass(montype) : MAXMCLASSES;
                    if (montype.length === 1 && cls !== MAXMCLASSES) {
                        species = mkclass(cls, G_NOGEN | G_IGNORE, {
                            state,
                            random: coreRandom,
                        });
                    } else {
                        for (let i = LOW_PM; i < NUMMONS; ++i) {
                            const names = state.mons[i].pmnames;
                            if ([names[NEUTRAL], names[MALE], names[FEMALE]]
                                .some(name => name != null && lcase(name) === token)) {
                                species = state.mons[i];
                                break;
                            }
                        }
                    }
                    if (!species) throw new Error('Unknown montype');
                    corpsenm = state.mons.indexOf(species);
                }
                spec = { ...spec, montype };
            }
            // Reuse a parsed id rather than invoking its Lua callback again.
            if (hasMontype) spec = { ...spec, id };
            const coordinate = get_table_xy_or_coord(spec);
            const normalized = {
                ...spec,
                coordinate,
                corpsenm,
            };
            return lspo_object(normalized, env.coder.croom, env);
        },

        gold(...args) { return lspo_gold(args, env); },

        monster(...args) {
            return lspo_monster(args, env.coder.croom, env);
        },

        stair(...args) { return lspo_stair(args, env); },

        ladder(...args) { return lspo_ladder(args, env); },

        grave(...args) { return lspo_grave(args, env); },

        shuffle(values) {
            shuffle_core_values(values, rn2);
            return values;
        },

        room(...args) { return lspo_room(args, env); },

        corridor(...args) { return lspo_corridor(args, env); },

        random_corridors(...args) {
            return lspo_random_corridors(args, env);
        },

        altar(...args) { return lspo_altar(args, env); },

        replace_terrain(...args) {
            return lspo_replace_terrain(args, env);
        },

        terrain(...args) { return lspo_terrain(args, env); },

        wallify(...args) { return lspo_wallify(args, env); },

        feature(...args) { return lspo_feature(args, env); },

        mazewalk(...args) { return lspo_mazewalk(args, env); },

        levregion(...args) { return lspo_levregion(args, env); },

        gas_cloud(...args) { return lspo_gas_cloud(args, env); },

        async reset_level(...args) { return lspo_reset_level(args, env); },

        async finalize_level(...args) { return lspo_finalize_level(args, env); },

        async finish() {
            const coder = env.coder;
            link_doors_rooms();
            remove_boundary_syms(frame, state);

            /* TODO: ensure_way_out() needs rewrite */
            if (coder.check_inaccessibles)
                await printQueued(ensure_way_out(env));

            // C ref: sp_lev.c load_special() post-processing.
            map_cleanup(state);
            if (!state.level.flags.corrmaze)
                wallification(1, 0, COLNO - 1, ROWNO - 1, state);
            // C ref: sp_lev.c flip_level_rnd(). Each allowed flip axis
            // consumes rn2(2). bigrm-12's "noflipy" clears bit 1, leaving
            // only the horizontal axis flip.
            await flip_level_rnd(coder.allow_flips, false, state);
            count_level_features(state);

            // C ref: sp_lev.c solidify_map(). Marks non-map STONE walls as
            // non-diggable and non-passwall.
            if (coder.solidify) {
                solidify_map(state, frame);
            }

            await finishFixupSpecial(state);

            // C ref: sp_lev.c:6052-6053. Reveal the entire map for
            // premapped levels (Sokoban).
            if (coder.premapped) {
                await printQueued(premap_detect(state));
            }

            // sp_lev.c:6454–6503 load_special() ends here, freeing
            // gc.coder. makelevel() fills natural loads;
            // lspo_finalize_level() fills direct loads after
            // level_finalize_topology() has mineralized the map.
            state.gc.coder = null;
        },
    });
    // selection is a Lua global library, separate from the C des.* table.
    // Bind its setpoint helper to this load's coder and random source.
    const luaGlobals = Object.freeze({
        random: coreRandom,
        selection: Object.freeze({
            set(...args) { return l_selection_setpoint(args, env); },
        }),
    });
    Object.defineProperty(des, SPECIAL_LEVEL_LUA_GLOBALS, {
        value: luaGlobals,
    });
    // Every sp_lev.c lspo_* function (and l_create_stairway() and
    // set_wallprop_in_selection(), behind stair, ladder, non_diggable and
    // non_passwall) starts with create_des_coder().
    for (const [name, descriptor] of Object.entries(
        Object.getOwnPropertyDescriptors(des),
    )) {
        if (typeof descriptor.value !== 'function') continue;
        const call = descriptor.value;
        // Each runs as a C function on the Lua stack, des.<name>.
        des[name] = DES_WITHOUT_CODER.has(name)
            ? function (...args) {
                return nhl_call_field(lua, name, () => call.apply(this, args));
            }
            : function (...args) {
                return nhl_call_field(lua, name, () => {
                    create_des_coder(state);
                    return call.apply(this, args);
                });
            };
    }
    // The Lua state a loader's own Lua calls run in, such as nhlsel.js
    // l_selection_iterate(); not a des.* field.
    Object.defineProperty(des, 'luaEnv', { value: { lua, state } });
    return des;
}

// JS row arrays represent C lspo_map()'s raw-string form (for example,
// bigrm1's matching authored Lua string and JS row literal). Native Lua array
// support is not implied. Preserve C's NUL prefix, dimensions and singleton reset.
function mapFromRows(rows, frame, state) {
    const inputWidth = rows[0]?.length ?? 0;
    if (!inputWidth || rows.some((row) => row.length !== inputWidth))
        throw new Error('special-level map rows must have equal width');
    const prefix = cStringPrefix(rows.join('\n'));
    const sourceRows = (prefix.endsWith('\n') ? prefix.slice(0, -1) : prefix)
        .split('\n');
    const height = sourceRows.length;
    // A NUL can shorten the final source row. C's mapfrag_get skips its
    // missing cells rather than rejecting the otherwise valid prefix.
    const width = Math.max(...sourceRows.map(row => row.length));
    if (!width) throw new Error('special-level map rows must have equal width');
    frame.xsize = width;
    frame.ysize = height;
    if (width <= 1 && height <= 1) {
        reset_xystart_size(frame, state);
        return { ...frame, selection: new ThemeroomSelection(null, true) };
    }
    frame.xstart = 2 + Math.trunc(
        (frame.xMazeMax - 2 - width) / 2,
    );
    frame.ystart = 2 + Math.trunc(
        (frame.yMazeMax - 2 - height) / 2,
    );
    if (!(frame.xstart % 2)) ++frame.xstart;
    if (!(frame.ystart % 2)) ++frame.ystart;
    // C ref: sp_lev.c:6227-6238. After the odd-parity adjustment the map
    // may overflow the level grid. Shift it back until it fits.
    if (frame.ystart < 0 || frame.ystart + height > ROWNO) {
        frame.ystart += (frame.ystart > 0) ? -2 : 2;
        if (height === ROWNO) frame.ystart = 0;
        if (frame.ystart < 0 || frame.ystart + height > ROWNO)
            frame.ystart = 0;
    }
    state.xstart = frame.xstart;
    state.ystart = frame.ystart;
    state.xsize = frame.xsize;
    state.ysize = frame.ysize;
    const selection = new ThemeroomSelection(null, true);
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const ax = frame.xstart + x;
            const ay = frame.ystart + y;
            const mptyp = splev_chr2typ(sourceRows[y][x]);
            if (mptyp === INVALID_TYPE) continue;
            if (mptyp >= MAX_TYPE) continue;
            set_themeroom_map_terrain(ax, ay, mptyp, state);
            // C ref: sp_lev.c:6292. Mark cells placed by the map fragment
            // so fill_empty_maze and maze1xy avoid them.
            if (frame.splevMap) frame.splevMap[ax][ay] = 1;
            selection.set(ax, ay);
        }
    }
    return { ...frame, selection };
}

// C ref: sp_lev.c wallify_map(). Converts STONE tiles adjacent to ROOM or
// CROSSWALL tiles into HWALL (horizontal neighbor) or VWALL (vertical
// neighbor). Distinct from wallification(), which cleans up wall subtypes.
export function wallify_map(x1, y1, x2, y2, state) {
    y1 = Math.max(y1, 0);
    x1 = Math.max(x1, 1);
    y2 = Math.min(y2, ROWNO - 1);
    x2 = Math.min(x2, COLNO - 1);
    for (let y = y1; y <= y2; ++y) {
        const loYY = y > 0 ? y - 1 : 0;
        const hiYY = y < y2 ? y + 1 : y2;
        for (let x = x1; x <= x2; ++x) {
            if (state.level.at(x, y).typ !== STONE) continue;
            const loXX = x > 1 ? x - 1 : 1;
            const hiXX = x < x2 ? x + 1 : x2;
            let done = false;
            for (let yy = loYY; yy <= hiYY && !done; ++yy) {
                for (let xx = loXX; xx <= hiXX; ++xx) {
                    const t = state.level.at(xx, yy).typ;
                    if (IS_ROOM(t) || t === CROSSWALL) {
                        state.level.at(x, y).typ
                            = (yy !== y) ? HWALL : VWALL;
                        done = true;
                        break;
                    }
                }
            }
        }
    }
}

// C ref: sp_lev.c rndtrap(). Picks a random trap type, excluding holes,
// vibrating squares, magic portals, and conditionally trapdoors and
// teleport traps.
function rndtrap(state) {
    let rtrap;
    do {
        rtrap = rnd(TRAPNUM - 1);
        switch (rtrap) {
        case HOLE:
        case VIBRATING_SQUARE:
        case MAGIC_PORTAL:
            rtrap = NO_TRAP;
            break;
        case TRAPDOOR:
            if (!Can_dig_down(state.u?.uz, state))
                rtrap = NO_TRAP;
            break;
        case LEVEL_TELEP:
        case TELEP_TRAP:
            if (state.level.flags.noteleport)
                rtrap = NO_TRAP;
            break;
        case ROLLING_BOULDER_TRAP:
        case ROCKTRAP:
            if (In_endgame(state.u?.uz, state))
                rtrap = NO_TRAP;
            break;
        }
    } while (rtrap === NO_TRAP);
    return rtrap;
}

// C ref: sp_lev.c maze1xy(). Finds a random odd-parity location in the
// maze area that is not covered by SpLev_Map and satisfies the humidity
// check. Uses rn1 for x and y, burning RNG calls on each attempt.
function maze1xy(humidity, frame, state) {
    let x, y, tryct = 2000;
    do {
        x = rn1(frame.xMazeMax - 3, 3);
        y = rn1(frame.yMazeMax - 3, 3);
        if (--tryct < 0) break;
    } while (
        !(x % 2) || !(y % 2)
        || (frame.splevMap && frame.splevMap[x][y])
        || !is_ok_location(x, y, humidity, { state })
    );
    return { x, y };
}

// C ref: sp_lev.c fill_empty_maze(). Fills unused maze area with random
// objects, boulders, minotaurs, monsters, gold, and traps proportional
// to how much of the maze the special-level map did not cover. A level
// program that #wizloadlua runs (nhlua.c load_lua()) walks its maze outside
// level creation, so makemon() and a statue trap's donor monster take their
// runtime form there.
async function fill_empty_maze(frame, state, env) {
    let mapcountmax, mapcount;
    mapcountmax = mapcount =
        (frame.xMazeMax - 2) * (frame.yMazeMax - 2);
    mapcountmax = Math.trunc(mapcountmax / 2);

    for (let x = 2; x < frame.xMazeMax; x++) {
        for (let y = 0; y < frame.yMazeMax; y++) {
            if (frame.splevMap && frame.splevMap[x][y])
                mapcount--;
        }
    }

    if (mapcount > Math.trunc(mapcountmax / 10)) {
        const mapfact = Math.trunc((mapcount * 100) / mapcountmax);
        // Objects: gems or random class
        for (let i = rnd(Math.trunc((20 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            await mkobj_at(rn2(2) ? GEM_CLASS : RANDOM_CLASS,
                mm.x, mm.y, true, env);
        }
        // Boulders
        for (let i = rnd(Math.trunc((12 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            const ttmp = t_at(mm.x, mm.y, state);
            if (ttmp && (is_pit(ttmp.ttyp) || is_hole(ttmp.ttyp)))
                continue;
            await mksobj_at(BOULDER, mm.x, mm.y, true, false, env);
        }
        // Minotaurs
        for (let i = rn2(2); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            await printQueued(makemon_by_context(
                state.mons[PM_MINOTAUR],
                mm.x,
                mm.y,
                NO_MM_FLAGS,
                env,
            ));
        }
        // Random monsters
        for (let i = rnd(Math.trunc((12 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            await printQueued(makemon_by_context(null, mm.x, mm.y, NO_MM_FLAGS, env));
        }
        // Gold
        for (let i = rn2(Math.trunc((15 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            mkgold(0, mm.x, mm.y, env);
        }
        // Traps
        for (let i = rn2(Math.trunc((15 * mapfact) / 100)); i > 0; i--) {
            const mm = maze1xy(DRY, frame, state);
            let trytrap = rndtrap(state);
            if (sobj_at(BOULDER, mm.x, mm.y, state)) {
                while (is_pit(trytrap) || is_hole(trytrap))
                    trytrap = rndtrap(state);
            }
            // sp_lev.c calls maketrap() directly here. Route through the
            // mklev wrapper to install its statue-trap capability while
            // retaining direct-call semantics for web and victim handling.
            await printQueued(make_level_trap(
                trytrap,
                MKTRAP_NOSPIDERONWEB | MKTRAP_NOVICTIM,
                null,
                mm,
                env,
            ));
        }
    }
}

// C ref: sp_lev.c lspo_map(). The themed-room form chooses an unconstrained
// origin, preserves transparent cells, and retries rather than overwriting a
// previously generated room.
export function lspo_map(definition, random = rn2, state = game) {
    const { width, height, map: rows } = definition;
    if (!rows || width <= 0 || height <= 0) return null;
    let tryct = 0;
    let xstart;
    let ystart;
    for (;;) {
        xstart = 1 + random(COLNO - 1 - width);
        ystart = random(ROWNO - height);
        if (themeroom_map_fits(definition, xstart, ystart, state)) break;
        if (tryct++ >= 100) return null;
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const typ = splev_chr2typ(rows[y][x]);
            if (typ >= MAX_TYPE) continue;
            set_themeroom_map_terrain(xstart + x, ystart + y, typ, state);
        }
    }
    return { x: xstart, y: ystart, width, height };
}

// C ref: sp_lev.c check_room()
export function check_room(lowx, ddx, lowy, ddy, vault, random = rn2) {
    const map = game.level;
    let hix = lowx.v + ddx.v, hiy = lowy.v + ddy.v;
    const xlim = XLIM + (vault ? 1 : 0);
    const ylim = YLIM + (vault ? 1 : 0);
    const s_lowx = lowx.v, s_ddx = ddx.v;
    const s_lowy = lowy.v, s_ddy = ddy.v;
    if (lowx.v < 3) lowx.v = 3;
    if (lowy.v < 2) lowy.v = 2;
    if (hix > COLNO - 3) hix = COLNO - 3;
    if (hiy > ROWNO - 3) hiy = ROWNO - 3;
    for (;;) {
        if (hix <= lowx.v || hiy <= lowy.v) return false;
        if (game.in_mk_themerooms
            && s_lowx !== lowx.v && s_ddx !== ddx.v
            && s_lowy !== lowy.v && s_ddy !== ddy.v) {
            return false;
        }
        let retry = false;
        for (let x = lowx.v - xlim; x <= hix + xlim && !retry; x++) {
            if (x <= 0 || x >= COLNO) continue;
            let y = Math.max(lowy.v - ylim, 0);
            const ymax = Math.min(hiy + ylim, ROWNO - 1);
            for (; y <= ymax; y++) {
                const loc = map.at(x, y);
                if (loc && loc.typ !== STONE) {
                    if (!random(3)) return false;
                    if (game.in_mk_themerooms) return false;
                    if (x < lowx.v) lowx.v = x + xlim + 1;
                    else hix = x - xlim - 1;
                    if (y < lowy.v) lowy.v = y + ylim + 1;
                    else hiy = y - ylim - 1;
                    retry = true;
                    break;
                }
            }
        }
        if (!retry) break;
    }
    ddx.v = hix - lowx.v;
    ddy.v = hiy - lowy.v;
    if (game.in_mk_themerooms
        && s_lowx !== lowx.v && s_ddx !== ddx.v
        && s_lowy !== lowy.v && s_ddy !== ddy.v) {
        return false;
    }
    return true;
}

// C ref: sp_lev.c create_room()
export function create_room(
    x, y, w, h, xal, yal, rtype, rlit,
    random = rn2,
    randomOneBased = rnd,
) {
    const g = game;
    let xabs = 0, yabs = 0;
    let r1 = null, r2 = null;
    let wtmp, htmp;
    let trycnt = 0;
    let vault = false;
    let xlim = XLIM, ylim = YLIM;
    if (rtype === -1) rtype = OROOM;
    if (rtype === VAULT) {
        vault = true;
        xlim++;
        ylim++;
    }
    rlit = litstate_rnd(rlit, random, randomOneBased);
    do {
        wtmp = w; htmp = h;
        let xtmp = x, ytmp = y;
        let xaltmp = xal, yaltmp = yal;
        if ((xtmp < 0 && ytmp < 0 && wtmp < 0 && xaltmp < 0 && yaltmp < 0) || vault) {
            r1 = rnd_rect(random);
            if (!r1) return false;
            const hx = r1.hx, hy = r1.hy, lx = r1.lx, ly = r1.ly;
            let dx, dy;
            if (vault) {
                dx = dy = 1;
            } else {
                dx = 2 + random((hx - lx > 28) ? 12 : 8);
                dy = 2 + random(4);
                if (dx * dy > 50) dy = Math.trunc(50 / dx);
            }
            const xborder = (lx > 0 && hx < COLNO - 1) ? 2 * xlim : xlim + 1;
            const yborder = (ly > 0 && hy < ROWNO - 1) ? 2 * ylim : ylim + 1;
            if (hx - lx < dx + 3 + xborder || hy - ly < dy + 3 + yborder) {
                r1 = null;
                continue;
            }
            xabs = lx + (lx > 0 ? xlim : 3)
                   + random(hx - (lx > 0 ? lx : 3) - dx - xborder + 1);
            yabs = ly + (ly > 0 ? ylim : 2)
                   + random(hy - (ly > 0 ? ly : 2) - dy - yborder + 1);
            if (ly === 0 && hy >= ROWNO - 1
                && (!g.level.nroom || !random(g.level.nroom))
                && (yabs + dy > Math.trunc(ROWNO / 2))) {
                // hack.h defines rn1(x, y) as the macro rn2(x) + y; the
                // recorder therefore identifies this source call as rn2(3).
                yabs = random(3) + 2;
                if (g.level.nroom < 4 && dy > 1) dy--;
            }
            const lowx = { v: xabs }, ddx = { v: dx };
            const lowy = { v: yabs }, ddy = { v: dy };
            if (!check_room(lowx, ddx, lowy, ddy, vault, random)) {
                r1 = null;
                continue;
            }
            xabs = lowx.v;
            yabs = lowy.v;
            wtmp = ddx.v + 1;
            htmp = ddy.v + 1;
            r2 = { lx: xabs - 1, ly: yabs - 1, hx: xabs + wtmp, hy: yabs + htmp };
        } else {
            // sp_lev.c create_room(): some, but not all, parameters are
            // random. Random positions reserve the source's extra border.
            let rndpos = 0;
            if (xtmp < 0 && ytmp < 0) {
                xtmp = randomOneBased(5);
                ytmp = randomOneBased(5);
                rndpos = 1;
            }
            if (wtmp < 0 || htmp < 0) {
                wtmp = random(15) + 3;
                htmp = random(8) + 2;
            }
            if (xaltmp === -1) xaltmp = randomOneBased(3);
            if (yaltmp === -1) yaltmp = randomOneBased(3);

            xabs = Math.trunc(((xtmp - 1) * COLNO) / 5) + 1;
            yabs = Math.trunc(((ytmp - 1) * ROWNO) / 5) + 1;
            if (xaltmp === SPLEV_RIGHT) {
                xabs += Math.trunc(COLNO / 5) - wtmp;
            } else if (xaltmp === SPLEV_CENTER) {
                xabs += Math.trunc((Math.trunc(COLNO / 5) - wtmp) / 2);
            }
            if (yaltmp === SPLEV_BOTTOM) {
                yabs += Math.trunc(ROWNO / 5) - htmp;
            } else if (yaltmp === SPLEV_CENTER) {
                yabs += Math.trunc((Math.trunc(ROWNO / 5) - htmp) / 2);
            }

            if (xabs + wtmp - 1 > COLNO - 2)
                xabs = COLNO - wtmp - 3;
            if (xabs < 2) xabs = 2;
            if (yabs + htmp - 1 > ROWNO - 2)
                yabs = ROWNO - htmp - 3;
            if (yabs < 2) yabs = 2;

            r2 = {
                lx: xabs - 1,
                ly: yabs - 1,
                hx: xabs + wtmp + rndpos,
                hy: yabs + htmp + rndpos,
            };
            r1 = get_rect(r2);
            if (r1) {
                const lowx = { v: xabs }, ddx = { v: wtmp };
                const lowy = { v: yabs }, ddy = { v: htmp };
                if (!check_room(lowx, ddx, lowy, ddy, vault, random)) {
                    r1 = null;
                } else {
                    xabs = lowx.v;
                    yabs = lowy.v;
                }
            }
        }
    } while (++trycnt <= 100 && !r1);
    if (!r1) return false;
    split_rects(r1, r2);
    if (!vault) {
        g.smeq[g.level.nroom] = g.level.nroom;
        add_room(xabs, yabs, xabs + wtmp - 1, yabs + htmp - 1, rlit, rtype, false);
    } else {
        if (!g.level.rooms[g.level.nroom]) g.level.rooms[g.level.nroom] = {};
        g.level.rooms[g.level.nroom].lx = xabs;
        g.level.rooms[g.level.nroom].ly = yabs;
    }
    return true;
}

// C ref: sp_lev.c create_subroom(). Coordinates are relative to the parent
// room; the paired edge adjustments intentionally retain the source's
// one-based random-position quirks.
function create_subroom(
    proom,
    x,
    y,
    w,
    h,
    rtype,
    rlit,
    random = rn2,
    randomOneBased = rnd,
) {
    const width = proom.hx - proom.lx + 1;
    const height = proom.hy - proom.ly + 1;
    if (width < 4 || height < 4) return false;

    if (w === -1) w = randomOneBased(width - 3);
    if (h === -1) h = randomOneBased(height - 3);
    if (x === -1) x = randomOneBased(width - w);
    if (y === -1) y = randomOneBased(height - h);
    if (x === 1) x = 0;
    if (y === 1) y = 0;
    if (x + w + 1 === width) ++x;
    if (y + h + 1 === height) ++y;
    if (rtype === -1) rtype = OROOM;
    rlit = litstate_rnd(rlit, random, randomOneBased);
    add_subroom(
        proom,
        proom.lx + x,
        proom.ly + y,
        proom.lx + x + w - 1,
        proom.ly + y + h - 1,
        rlit,
        rtype,
        false,
    );
    return true;
}

// C ref: sp_lev.c build_room(). This low-level boundary accepts normalized
// rtype/rlit/needfill fields; direct handlers adapt their Lua-shaped fields via
// run_room_descriptor(). chance selects the requested type versus OROOM, not
// whether a room exists. create_room()/create_subroom() append one room and
// return only success, so null below means construction itself failed.
export function build_room(
    spec,
    parent = null,
    random = rn2,
    randomOneBased = rnd,
) {
    const requestedType = spec.rtype ?? OROOM;
    const chance = spec.chance ?? 100;
    const rtype = (!chance || random(100) < chance)
        ? requestedType : OROOM;
    const roomIndex = parent
        ? (game.nsubroom ?? 0) : game.level.nroom;
    const ok = parent
        ? create_subroom(
            parent,
            spec.x ?? -1,
            spec.y ?? -1,
            spec.w ?? -1,
            spec.h ?? -1,
            rtype,
            spec.rlit ?? -1,
            random,
            randomOneBased,
        )
        : create_room(
            spec.x ?? -1,
            spec.y ?? -1,
            spec.w ?? -1,
            spec.h ?? -1,
            spec.xalign ?? -1,
            spec.yalign ?? -1,
            rtype,
            spec.rlit ?? -1,
            random,
            randomOneBased,
        );
    if (!ok) return null;

    const room = parent
        ? game.subrooms[roomIndex] : game.level.rooms[roomIndex];
    topologize(room);
    room.needfill = spec.needfill ?? FILL_NONE;
    room.needjoining = spec.joined ?? true;
    return room;
}

// C ref: sp_lev.c dig_corridor()
export function dig_corridor(org, dest, npoints_out, nxcor, ftyp, btyp) {
    const map = game.level;
    let dx = 0, dy = 0;
    let xx = org.x, yy = org.y;
    const tx = dest.x, ty = dest.y;
    let npoints = 0;
    if (npoints_out) npoints_out.v = 0;
    if (xx <= 0 || yy <= 0 || tx <= 0 || ty <= 0
        || xx > COLNO - 1 || tx > COLNO - 1 || yy > ROWNO - 1 || ty > ROWNO - 1)
        return false;
    if (tx > xx) dx = 1;
    else if (ty > yy) dy = 1;
    else if (tx < xx) dx = -1;
    else dy = -1;
    xx -= dx; yy -= dy;
    let cct = 0;
    while (xx !== tx || yy !== ty) {
        if (cct++ > 500 || (nxcor && !rn2(35))) return false;
        xx += dx; yy += dy;
        if (xx >= COLNO - 1 || xx <= 0 || yy <= 0 || yy >= ROWNO - 1) return false;
        const crm = map.at(xx, yy);
        if (!crm) return false;
        if (crm.typ === btyp) {
            if (ftyp === CORR && maybe_sdoor(100)) {
                npoints++;
                if (npoints_out) npoints_out.v = npoints;
                crm.typ = SCORR;
            } else {
                npoints++;
                if (npoints_out) npoints_out.v = npoints;
                crm.typ = ftyp;
                if (nxcor && !rn2(50)) {
                    mksobj_at(
                        BOULDER,
                        xx,
                        yy,
                        true,
                        false,
                        levelObjectEnv(),
                    );
                }
            }
        } else if (crm.typ !== ftyp && crm.typ !== SCORR) {
            return false;
        }
        let dix = Math.abs(xx - tx);
        let diy = Math.abs(yy - ty);
        if ((dix > diy) && diy && !rn2(dix - diy + 1)) dix = 0;
        else if ((diy > dix) && dix && !rn2(diy - dix + 1)) diy = 0;
        if (dy && dix > diy) {
            const ddx = (xx > tx) ? -1 : 1;
            const ncr = map.at(xx + ddx, yy);
            if (ncr && (ncr.typ === btyp || ncr.typ === ftyp || ncr.typ === SCORR)) {
                dx = ddx; dy = 0; continue;
            }
        } else if (dx && diy > dix) {
            const ddy = (yy > ty) ? -1 : 1;
            const ncr = map.at(xx, yy + ddy);
            if (ncr && (ncr.typ === btyp || ncr.typ === ftyp || ncr.typ === SCORR)) {
                dy = ddy; dx = 0; continue;
            }
        }
        const straight = map.at(xx + dx, yy + dy);
        if (straight && (straight.typ === btyp || straight.typ === ftyp || straight.typ === SCORR))
            continue;
        if (dx) { dx = 0; dy = (ty < yy) ? -1 : 1; }
        else { dy = 0; dx = (tx < xx) ? -1 : 1; }
        const alt = map.at(xx + dx, yy + dy);
        if (alt && (alt.typ === btyp || alt.typ === ftyp || alt.typ === SCORR)) continue;
        dy = -dy; dx = -dx;
    }
    if (npoints_out) npoints_out.v = npoints;
    return true;
}

const ROOM_DOOR_STATE_MASKS = Object.freeze({
    random: -1,
    open: D_ISOPEN,
    closed: D_CLOSED,
    locked: D_LOCKED,
    nodoor: D_NODOOR,
    broken: D_BROKEN,
    secret: D_SECRET,
});

const ROOM_DOOR_WALL_MASKS = Object.freeze({
    all: W_ANY,
    random: W_ANY,
    north: W_NORTH,
    south: W_SOUTH,
    east: W_EAST,
    west: W_WEST,
});

function rnddoor(random) {
    // C ref: sp_lev.c rnddoor(). ROLL_FROM chooses among these five states.
    return [D_NODOOR, D_BROKEN, D_ISOPEN, D_CLOSED, D_LOCKED][random(5)];
}

// C ref: sp_lev.c create_door(). The descriptor is deliberately mutable:
// source resolves its random fields in place before attempting placement.
// After 100 failed tries C prints impossible("create_door: Can't find a
// proper place!"); the caller's onImpossible prints it (see
// js/source_steps.js), and the result is a promise when it waits.
export function create_door(dd, broom, random = rn2, onImpossible) {
    return finish_steps(create_door_steps(dd, broom, random),
        onImpossible ?? sync_impossible, game);
}

function* create_door_steps(dd, broom, random) {
    if (dd.secret === -1) dd.secret = random(2);
    if (dd.wall === W_RANDOM) dd.wall = W_ANY;

    if (dd.mask === -1) {
        if (!dd.secret) {
            if (!random(3)) {
                if (!random(5)) dd.mask = D_ISOPEN;
                else if (!random(6)) dd.mask = D_LOCKED;
                else dd.mask = D_CLOSED;
                if (dd.mask !== D_ISOPEN && !random(25))
                    dd.mask |= D_TRAPPED;
            } else {
                dd.mask = D_NODOOR;
            }
        } else {
            if (!random(5)) dd.mask = D_LOCKED;
            else dd.mask = D_CLOSED;
            if (!random(20)) dd.mask |= D_TRAPPED;
        }
    }

    let x = 0;
    let y = 0;
    let trycnt;
    for (trycnt = 0; trycnt < 100; ++trycnt) {
        const dwall = dd.wall;
        const dpos = dd.pos;
        switch (random(4)) {
        case 0:
            if (!(dwall & W_NORTH)) continue;
            y = broom.ly - 1;
            x = broom.lx + (dpos === -1
                ? random(1 + broom.hx - broom.lx) : dpos);
            if (!isok(x, y - 1)
                || IS_OBSTRUCTED(game.level.at(x, y - 1).typ)) continue;
            break;
        case 1:
            if (!(dwall & W_SOUTH)) continue;
            y = broom.hy + 1;
            x = broom.lx + (dpos === -1
                ? random(1 + broom.hx - broom.lx) : dpos);
            if (!isok(x, y + 1)
                || IS_OBSTRUCTED(game.level.at(x, y + 1).typ)) continue;
            break;
        case 2:
            if (!(dwall & W_WEST)) continue;
            x = broom.lx - 1;
            y = broom.ly + (dpos === -1
                ? random(1 + broom.hy - broom.ly) : dpos);
            if (!isok(x - 1, y)
                || IS_OBSTRUCTED(game.level.at(x - 1, y).typ)) continue;
            break;
        case 3:
            if (!(dwall & W_EAST)) continue;
            x = broom.hx + 1;
            y = broom.ly + (dpos === -1
                ? random(1 + broom.hy - broom.ly) : dpos);
            if (!isok(x + 1, y)
                || IS_OBSTRUCTED(game.level.at(x + 1, y).typ)) continue;
            break;
        }
        if (okdoor(x, y)) break;
    }
    if (trycnt >= 100) {
        yield new ImpossibleCall('create_door: Can\'t find a proper place!');
        return false;
    }
    if (!set_levltyp(x, y, dd.secret ? SDOOR : DOOR, { state: game }))
        return false;

    // struct rm.flags is a five-bit field. In particular, the parser's
    // D_SECRET pseudo-mask is truncated when it is assigned to an SDOOR.
    const mask = dd.mask & 0x1f;
    const loc = game.level.at(x, y);
    loc.flags = mask;
    return true;
}

// C ref: sp_lev.c lspo_door(), restricted to its room-wall form. Lua's
// random state resolution consumes and discards rnddoor() before create_door()
// rolls the actual state; rnddoor() never yields the parser-only secret state.
// Every caller passes a state and wall that the two tables name, as
// themerms.lua's literals do.
export function create_room_door(spec, broom, random = rn2) {
    const stateName = spec.state ?? 'random';
    const wallName = spec.wall ?? 'all';
    const mask = ROOM_DOOR_STATE_MASKS[stateName];
    if (mask === -1) rnddoor(random);
    // The synchronous form of create_door(): not every themeroom callback
    // here can wait, so its impossible() report is queued
    // (source_steps.js sync_impossible()) and the steps never yield a promise,
    // so the result is create_door_steps()'s placement flag.
    const placed = finish_steps(create_door_steps({
        secret: mask === D_SECRET ? 1 : 0,
        mask,
        pos: spec.pos ?? -1,
        wall: ROOM_DOOR_WALL_MASKS[wallName],
    }, broom, random), sync_impossible, game);
    return placed;
}

// C ref: sp_lev.c shared_with_room()/maybe_add_door().
function shared_with_room(x, y, droom) {
    const map = game.level;
    const loc = map.at(x, y);
    const rmno = ROOM_INDEX(droom) + ROOMOFFSET;
    if (!loc) return false;
    if (loc.roomno === rmno && !loc.edge) return false;
    if (isok(x - 1, y) && map.at(x - 1, y).roomno === rmno
        && x - 1 <= droom.hx) return true;
    if (isok(x + 1, y) && map.at(x + 1, y).roomno === rmno
        && x + 1 >= droom.lx) return true;
    if (isok(x, y - 1) && map.at(x, y - 1).roomno === rmno
        && y - 1 <= droom.hy) return true;
    if (isok(x, y + 1) && map.at(x, y + 1).roomno === rmno
        && y + 1 >= droom.ly) return true;
    return false;
}

function maybe_add_door(x, y, droom) {
    const loc = game.level.at(x, y);
    const rmno = ROOM_INDEX(droom) + ROOMOFFSET;
    if (droom.hx >= 0 && loc
        && ((!droom.irregular && inside_room(droom, x, y))
            || loc.roomno === rmno
            || shared_with_room(x, y, droom))) {
        add_door(x, y, droom);
    }
}

// C ref: sp_lev.c link_doors_rooms(). Scans every tile for doors and links
// each to its adjacent room. Called from finish() after special level creation.
function link_doors_rooms() {
    const nroom = game.level?.nroom ?? 0;
    const rooms = game.level?.rooms ?? [];
    for (let y = 0; y < ROWNO; ++y) {
        for (let x = 0; x < COLNO; ++x) {
            const typ = game.level.at(x, y).typ;
            if (IS_DOOR(typ) || typ === SDOOR) {
                set_door_orientation(x, y, game);
                for (let i = 0; i < nroom; ++i) {
                    maybe_add_door(x, y, rooms[i]);
                    const subrooms = rooms[i].sbrooms ?? [];
                    const nsub = rooms[i].nsubrooms ?? subrooms.length;
                    for (let m = 0; m < nsub; ++m)
                        maybe_add_door(x, y, subrooms[m]);
                }
            }
        }
    }
}

// C ref: sp_lev.c add_doors_to_room(). lspo_room() calls this after a room's
// contents callback, then recurses through any already-completed subrooms.
export function add_doors_to_room(croom) {
    for (let x = croom.lx - 1; x <= croom.hx + 1; ++x) {
        for (let y = croom.ly - 1; y <= croom.hy + 1; ++y) {
            const typ = game.level.at(x, y)?.typ;
            if (IS_DOOR(typ) || typ === SDOOR)
                maybe_add_door(x, y, croom);
        }
    }
    const subrooms = croom.sbrooms ?? [];
    const count = croom.nsubrooms ?? subrooms.length;
    for (let i = 0; i < count; ++i)
        add_doors_to_room(subrooms[i]);
}

// C ref: sp_lev.c map_cleanup(). Liquid squares cannot retain boulders,
// ordinary traps, or engravings after a special level has been loaded.
export function map_cleanup(state = game) {
    const objectEnv = objectGenerationEnv({ state });

    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const typ = state.level.at(x, y).typ;
            if (!IS_LAVA(typ) && !IS_POOL(typ)) continue;

            // C ref: remove every BOULDER with sobj_at(), obj_extract_self(),
            // and obfree(), preserving the level and square object chains.
            let boulder;
            while ((boulder = sobj_at(BOULDER, x, y, state)) !== null) {
                obj_extract_self(boulder, objectEnv);
                obfree(boulder, null, objectEnv);
            }

            // C ref: deltrap() removes a liquid-cell trap unless it is one of
            // the two traps explicitly protected by undestroyable_trap().
            const trap = t_at(x, y, state);
            if (trap && !undestroyable_trap(trap.ttyp)) deltrap(trap, state);

            if (engr_at(x, y, state)) del_engr_at(x, y, state);
        }
    }
}

// C ref: sp_lev.c solidify_map(). Only stone/walls not placed by the
// special-level author receive the extra dig/phase protection. The loader
// frame owns C's SpLev_Map bitmap, including stair/door/drawbridge writes.
function solidify_map(state, frame) {
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const location = state.level.at(x, y);
            if (IS_STWALL(location.typ) && !frame.splevMap[x][y])
                location.flags |= W_NONDIGGABLE | W_NONPASSWALL;
        }
    }
}
