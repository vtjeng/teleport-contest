// detect.js — searching and discovery.
// C ref: detect.c dosearch0(), dosearch(), mfind0(), cvt_sdoor_to_door(),
// find_trap(), and findit()'s empty-result path.

import {
    A_WIS,
    A_INT,
    BEAR_TRAP,
    BLINDED,
    BURIED_TOO,
    BOLT_LIM,
    COLNO,
    CONFUSION,
    CONTAINED_TOO,
    CORR,
    DETECT_MONSTERS,
    DOOR,
    D_CLOSED,
    D_BROKEN,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    ECMD_OK,
    ECMD_TIME,
    GPCOORDS_COMFULL,
    GPCOORDS_COMPASS,
    GPCOORDS_MAP,
    GPCOORDS_NONE,
    GPCOORDS_SCREEN,
    HALLUC,
    HALLUC_RES,
    HALF_PHDAM,
    KILLED_BY_AN,
    TIMEOUT,
    SYM_BOULDER,
    M_AP_OBJECT,
    I_SPECIAL,
    Is_airlevel,
    Is_waterlevel,
    IS_FURNITURE,
    IS_WALL,
    MAXTCHARS,
    M_AP_FURNITURE,
    M_AP_TYPE,
    ROOMOFFSET,
    ROWNO,
    SCORR,
    SDOOR,
    STONE,
    STUNNED,
    STATUE_TRAP,
    TER_MAP,
    TER_MON,
    TER_DETECT,
    TRAPPED_CHEST,
    TRAPPED_DOOR,
    TOE,
    Never_mind,
    quitchars,
    Has_contents,
    helpless,
    has_mcorpsenm,
    SVALL,
    WM_MASK,
    isok,
    u_at,
} from './const.js';
import { SPFX_SEARCH } from './artifacts.js';
import {
    DEF_OC_SYMS_NAMES,
    def_char_is_furniture,
    def_char_to_monclass,
    def_char_to_objclass,
} from './drawing.js';
import { acurr, exercise } from './attrib.js';
import { cmdSafetyPrevention, yn_function } from './cmd.js';
import {
    back_to_glyph,
    cmap_to_glyph,
    cls,
    docrt,
    display_self,
    glyph_is_invisible,
    glyph_is_cmap,
    glyph_is_monster,
    glyph_is_object,
    glyph_is_trap,
    glyph_is_warning,
    glyph_at,
    feel_location,
    map_invisible,
    map_invisible_planning,
    warning_of,
    glyph_to_cmap,
    glyph_to_obj,
    hero_glyph_info,
    map_glyphinfo,
    map_monster_glyph_info,
    map_engraving,
    magic_map_background,
    map_trap,
    map_object,
    newsym,
    object_glyph_info,
    remembered_glyph_from_presentation,
    show_glyph_cell,
    trap_glyph_info,
    trap_to_glyph,
    unmap_object,
    unmap_invisible,
    xy_set_wall_state,
    flush_screen,
} from './display.js';
import { depth, on_level, room_discovered } from './dungeon.js';
import {
    engr_at,
} from './engrave.js';
import { game } from './gstate.js';
import { getpos } from './getpos.js';
import { get_obj_location } from './light.js';
import { Is_box } from './lock.js';
import { losehp, nomul } from './hack.js';
import { hides_under, is_hider, resists_blnd } from './mondata.js';
import {
    NUMMONS,
    PM_LONG_WORM,
    PM_TENGU,
    S_EEL,
    S_GHOST,
    S_MIMIC,
    S_WORM_TAIL,
} from './monsters.js';
import { m_at } from './monst.js';
// seemimic() is the mon.c owner; display.c supplies only the glyph/display
// helpers it calls.
import { seemimic as monSeemimic } from './mon.js';
import { a_monnam, hcolor, y_monnam } from './do_name.js';
import { xnameFresh, Tobjnam, the } from './objnam.js';
import { discover_object, observe_object } from './o_init.js';
import {
    make_blinded,
    make_confused,
    make_hallucinated,
    strange_feeling,
} from './potion.js';
import { poly_gender } from './polyself.js';
import { body_part } from './polyself.js';
import { is_quest_artifact } from './questpgr.js';
import { consume_obj_charge, useup } from './invent.js';
import { findgold } from './steal.js';
import { makeplural } from './fruit.js';
import { note_unported } from './unported.js';
import { isBox, sobj_at } from './obj.js';
import {
    CHEST,
    COIN_CLASS,
    CRYSTAL_BALL,
    GOLD,
    GOLD_PIECE,
    LARGE_BOX,
    LENSES,
    MAXOCLASSES,
    POTION_CLASS,
    ROCK_CLASS,
    SCROLL_CLASS,
    SPBOOK_CLASS,
} from './objects.js';
import { visible_region_at } from './region.js';
import { rn2, rnd, rnl } from './rng.js';
import {
    MAXMCLASSES,
    SYM_OFF_M,
    SYM_OFF_O,
    S_arrow_trap,
    S_cloud,
    S_corr,
    S_darkroom,
    S_litcorr,
    S_poisoncloud,
    S_room,
    S_stone,
    S_tree,
    S_upstair,
    S_fountain,
    SYM_OFF_X,
} from './symbols.js';
import { DEFAULT_PRIMARY_SYMBOLS } from './symbol_data.js';
import { canSpotMonster, sensesMonster } from './startup_a11y.js';
import { t_at, trapname } from './trap.js';
import {
    dismissPendingTtyMessage,
    displayPendingTtyMessageWindow,
    ttyPline,
} from './tty_message.js';
import {
    cansee,
    do_clear_area,
    unblock_point,
    vision_reset,
} from './vision.js';
import { GLYPH_SWALLOW_OFF, GLYPH_UNEXPLORED_OFF } from './glyph_offsets.js';
import { NO_COLOR } from './terminal.js';

/** A branch of detect.c discovery which this port does not own yet. */
export class UnsupportedSearchError extends Error {
    constructor(message) {
        super(message);
        this.name = 'UnsupportedSearchError';
    }
}

// C refs: detect.c unconstrain_map()/reconstrain_map() (70-91). This slice
// owns only an ordinary, unconstrained map. Save slots are still initialized
// so reconstrain_map() follows the source-shaped no-op path.
export function unconstrain_map(state = game) {
    const constrained = Boolean(
        state.u?.uinwater || state.u?.uburied || state.u?.uswallow,
    );
    state.iflags ??= {};
    state.iflags.save_uinwater = state.u.uinwater ?? 0;
    state.iflags.save_uburied = state.u.uburied ?? 0;
    state.iflags.save_uswallow = state.u.uswallow ?? 0;
    state.u.uinwater = 0;
    state.u.uburied = 0;
    state.u.uswallow = 0;
    return constrained;
}

export function reconstrain_map(state = game) {
    state.u.uinwater = state.iflags?.save_uinwater ?? 0;
    state.u.uburied = state.iflags?.save_uburied ?? 0;
    state.u.uswallow = state.iflags?.save_uswallow ?? 0;
    state.iflags.save_uinwater = 0;
    state.iflags.save_uburied = 0;
    state.iflags.save_uswallow = 0;
}

function glyphIsSwallow(glyph) {
    return Number.isInteger(glyph)
        && glyph >= GLYPH_SWALLOW_OFF
        && glyph < GLYPH_SWALLOW_OFF + (NUMMONS << 3);
}

function glyphIsGascloud(glyph) {
    if (!glyph_is_cmap(glyph)) return false;
    const cmap = glyph_to_cmap(glyph);
    return cmap === S_cloud || cmap === S_poisoncloud;
}

function terrainGlyphInfo(glyph, state) {
    // display.c's GLYPH_UNEXPLORED is a real glyph number, but this port's
    // ordinary map renderer represents it as an unremembered blank.  Keep the
    // number on the transient presentation so reveal_terrain_getglyph() can
    // still make the same source-shaped comparisons.
    if (glyph === undefined || glyph === GLYPH_UNEXPLORED_OFF) {
        return {
            glyph: GLYPH_UNEXPLORED_OFF,
            ch: ' ',
            color: NO_COLOR,
            dec: false,
        };
    }
    return map_glyphinfo(glyph, state);
}

// C ref: detect.c reveal_terrain_getglyph() (2167-2294).  This slice owns
// exactly TER_MAP: remembered terrain with monsters, objects, traps, and
// invisible-monster markers removed.  Other subsets remain a deliberate
// boundary in doterrain(), so they cannot accidentally acquire a partial
// implementation here.
export function reveal_terrain_getglyph(
    x, y, swallowed, defaultGlyph, whichSubset, state = game,
) {
    if (whichSubset !== TER_MAP) {
        throw new UnsupportedSearchError(
            'terrain projection subset is not ported',
        );
    }

    const location = state.level?.at(x, y);
    if (!location) return defaultGlyph;

    // C uses levl.seenv when hero memory is enabled, otherwise it substitutes
    // SVALL only for a currently visible square.  The restored normal witness
    // is the hero-memory arm; retaining both terms keeps this helper aligned
    // with the source without opening a second gameplay boundary.
    const heroMemory = Boolean(state.level?.flags?.hero_memory);
    const seenv = heroMemory
        ? (location.seenv ?? 0)
        : cansee(x, y, state) ? SVALL : 0;
    const remembered = location.remembered_glyph?.glyph
        ?? GLYPH_UNEXPLORED_OFF;
    const levelGlyph = heroMemory
        ? remembered
        : seenv ? back_to_glyph(x, y, state) : defaultGlyph;
    let glyph = swallowed ? levelGlyph : glyph_at(x, y, state);
    let wasMonster = false;
    const region = visible_region_at(x, y, state);

    // C's keep_mons is false for TER_MAP.  A swallow glyph is also removed;
    // the preflight in reveal_terrain keeps the ordinary path unconstrained.
    if ((!glyph_is_monster(glyph) && !glyph_is_warning(glyph))
        && !glyphIsSwallow(glyph)) {
        // This branch is intentionally empty: it is the source's fallthrough
        // when no monster-like display layer covers the square.
    } else {
        glyph = levelGlyph;
        wasMonster = true;
    }

    // With TER_MAP, keep_traps and keep_objs are both false.  The first C
    // clause would restore a known trap only for a different menu selection;
    // the conditional is retained so this source correspondence is explicit.
    if (glyph_is_invisible(glyph)) {
        // The final replacement below handles the invisible-monster marker.
    }

    if (glyph_is_object(glyph)
        || glyph_is_trap(glyph)
        || glyphIsGascloud(glyph)
        || (region && wasMonster)
        || glyph_is_invisible(glyph)) {
        if (!seenv) {
            glyph = region ? GLYPH_UNEXPLORED_OFF : defaultGlyph;
        } else {
            const lastSeenType = state.level?.lastseentyp?.[x]?.[y]
                ?? STONE;
            if (lastSeenType === location.typ) {
                glyph = back_to_glyph(x, y, state);
            } else {
                const monster = m_at(x, y, state);
                if (monster && M_AP_TYPE(monster) === M_AP_FURNITURE) {
                    glyph = cmap_to_glyph(monster.mappearance, state);
                } else {
                    // back_to_glyph() needs the remembered topology and some
                    // current flags.  C copies the rm struct, recalculates
                    // wall_info when necessary, then restores it verbatim.
                    const saved = { ...location };
                    location.typ = lastSeenType;
                    if (IS_WALL(location.typ) || location.typ === SDOOR)
                        xy_set_wall_state(x, y, state);
                    glyph = back_to_glyph(x, y, state);
                    Object.assign(location, saved);
                }
            }
        }
    }

    // C's dirty compatibility tail converts remembered dark-room and lit
    // corridor glyphs back to their ordinary map symbols.
    if (glyph === cmap_to_glyph(S_darkroom, state))
        glyph = cmap_to_glyph(S_room, state);
    else if (glyph === cmap_to_glyph(S_litcorr, state))
        glyph = cmap_to_glyph(S_corr, state);
    return glyph;
}

// C ref: detect.c browse_map() (94-106). The temporary presentation is a
// getpos() concern: TER_MAP has already replaced the visible glyphs, so this
// function only supplies getpos() with the source's terrainmode and automatic
// description flags, then restores both after it returns.
export async function browse_map(
    terTyp, terExplain, state = game,
) {
    if (terTyp !== TER_MAP && terTyp !== (TER_DETECT | TER_MON))
        throw new UnsupportedSearchError('terrain browse subset');
    if (state !== game)
        throw new TypeError('browse_map() redraws the global game');

    const dummyPos = { x: state.u.ux, y: state.u.uy };
    state.iflags ??= {};
    const saveAutodescribe = state.iflags.autodescribe;
    state.iflags.autodescribe = true;
    state.iflags.terrainmode = terTyp;
    try {
        await getpos(dummyPos, false, terExplain, state);
    } finally {
        // C unconditionally clears terrainmode, while autodescribe is the
        // caller's option and must return to its pre-browse value.
        state.iflags.terrainmode = 0;
        state.iflags.autodescribe = saveAutodescribe;
    }
}

// C ref: detect.c map_monst() (122-133). The temporary detector display is
// not newsym(): it must show every live monster regardless of current sight,
// and it must not replace remembered map glyphs. The display producer handles
// pet highlighting and the display-RNG hallucination branch just as the C
// mon_to_glyph()/pet_to_glyph() macros do.
function map_monst(monster, state = game, env = {}) {
    const showMonster = env.mapMonster ?? ((subject) => show_glyph_cell(
        subject.mx,
        subject.my,
        map_monster_glyph_info(subject, state),
    ));
    showMonster(monster, state);
}

function liveMonsters(state) {
    const result = [];
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        // C DEADMONSTER() is mhp < 1; the guard also excludes a dungeon
        // guardian that has not entered the level (isgd && !mx).
        if (monster.mhp < 1 || (monster.isgd && !monster.mx)) continue;
        result.push(monster);
    }
    return result;
}

// C refs: detect.c o_in()/o_material() (201-247). These recursive searches
// preserve object-chain order and return the first matching object. The
// source deliberately treats a Schroedinger's box differently in o_in():
// its possible cat corpse is not a stable class result until opened.
export function o_in(obj, oclass, state = game) {
    if (obj.oclass === oclass) return obj;
    const schroedingersBox = obj.otyp === LARGE_BOX && obj.spe === 1;
    if (Has_contents(obj) && !schroedingersBox) {
        for (let member = obj.cobj; member; member = member.nobj) {
            if (member.oclass === oclass) return member;
            if (Has_contents(member)) {
                const found = o_in(member, oclass, state);
                if (found) return found;
            }
        }
    }
    return null;
}

export function o_material(obj, material, state = game) {
    if (state.objects[obj.otyp].oc_material === material) return obj;
    if (Has_contents(obj)) {
        for (let member = obj.cobj; member; member = member.nobj) {
            if (state.objects[member.otyp].oc_material === material)
                return member;
            if (Has_contents(member)) {
                const found = o_material(member, material, state);
                if (found) return found;
            }
        }
    }
    return null;
}

export function check_map_spot(x, y, oclass, material, state = game) {
    const glyph = glyph_at(x, y, state);
    if (!glyph_is_object(glyph)) return false;

    if (oclass === MAXOCLASSES + 1) {
        return !state.level.objects?.[x]?.[y]
            && !(m_at(x, y, state)?.minvent);
    }

    const shownType = glyph_to_obj(glyph);
    if (material
        && state.objects[shownType]?.oc_material === material) {
        for (let obj = state.level.objects?.[x]?.[y] ?? null;
            obj; obj = obj.nexthere) {
            if (o_material(obj, GOLD, state)) return false;
        }
        const monster = m_at(x, y, state);
        for (let obj = monster?.minvent ?? null; obj; obj = obj.nobj) {
            if (o_material(obj, GOLD, state)) return false;
        }
        return true;
    }

    if (oclass && state.objects[shownType]?.oc_class === oclass) {
        for (let obj = state.level.objects?.[x]?.[y] ?? null;
            obj; obj = obj.nexthere) {
            if (o_in(obj, oclass, state)) return false;
        }
        const monster = m_at(x, y, state);
        for (let obj = monster?.minvent ?? null; obj; obj = obj.nobj) {
            if (o_in(obj, oclass, state)) return false;
        }
        return true;
    }
    return false;
}

function clear_stale_map(oclass, material, state = game) {
    let changeMade = false;
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            if (check_map_spot(x, y, oclass, material, state)) {
                unmap_object(x, y, state);
                changeMade = true;
            }
        }
    }
    return changeMade;
}

// C ref: detect.c observe_recursively() (249-259).
function observe_recursively(obj, state = game) {
    observe_object(obj, state);
    if (Has_contents(obj)) {
        for (let member = obj.cobj; member; member = member.nobj)
            observe_recursively(member, state);
    }
}

function heroConfused(state) {
    const confusion = state.u?.uprops?.[CONFUSION];
    return Boolean((confusion?.intrinsic || confusion?.extrinsic)
        && !confusion?.blocked);
}

// C ref: detect.c object_detect() (603-793). Floor, buried, and monster
// inventories are scanned in C order; when a contained match is mapped its
// parent location is copied to the matched object before display.c maps it.
export async function object_detect(detector = null, objectClass = 0,
    state = game) {
    let oclass = objectClass;
    if (!Number.isInteger(oclass) || oclass < 0 || oclass >= MAXOCLASSES) {
        await ttyPline(
            `impossible: object_detect:  illegal class ${oclass}`, state,
        );
        oclass = 0;
    }

    const showSymbols = state.gs?.showsyms ?? [];
    const classSymbol = oclass
        ? DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + oclass] : 0;
    const boulder = classSymbol
        && classSymbol === showSymbols[SYM_OFF_X + SYM_BOULDER]
        ? ROCK_CLASS : 0;
    const stuff = heroHallucinating(state)
        || (heroConfused(state) && oclass === SCROLL_CLASS)
        ? 'something'
        : oclass ? DEF_OC_SYMS_NAMES[oclass] : 'objects';
    const description = boulder && oclass !== ROCK_CLASS
        ? `${stuff} and/or large stones` : stuff;
    const detectKnown = Boolean(detector
        && (detector.oclass === POTION_CLASS
            || detector.oclass === SPBOOK_CLASS)
        && detector.blessed);
    let count = 0;
    let countHere = 0;
    const floorObjects = state.level?.objlist ?? null;
    const buriedObjects = state.level?.buriedobjlist ?? null;

    state.gk ??= {};

    if (detectKnown) {
        for (let obj = state.invent ?? null; obj; obj = obj.nobj)
            observe_recursively(obj, state);
    }

    for (let obj = floorObjects; obj; obj = obj.nobj) {
        if ((!oclass && !boulder)
            || o_in(obj, oclass, state)
            || o_in(obj, boulder, state)) {
            if (u_at(obj.ox, obj.oy, state)) ++countHere;
            else ++count;
        }
        if (detectKnown) observe_recursively(obj, state);
    }

    for (let obj = buriedObjects; obj; obj = obj.nobj) {
        if (!oclass || o_in(obj, oclass, state)) {
            if (u_at(obj.ox, obj.oy, state)) ++countHere;
            else ++count;
        }
        if (detectKnown) observe_recursively(obj, state);
    }

    if (state.u.usteed) {
        state.u.usteed.mx = state.u.ux;
        state.u.usteed.my = state.u.uy;
    }

    for (let monster = state.level?.monlist ?? null;
        monster; monster = monster.nmon) {
        if (monster.mhp < 1 || (monster.isgd && !monster.mx)) continue;
        for (let obj = monster.minvent ?? null; obj; obj = obj.nobj) {
            if ((!oclass && !boulder)
                || o_in(obj, oclass, state)
                || o_in(obj, boulder, state)) {
                ++count;
            }
            if (detectKnown) observe_recursively(obj, state);
        }
        const mimic = detector?.cursed
            && M_AP_TYPE(monster) === M_AP_OBJECT
            && (!oclass
                || oclass === state.objects[monster.mappearance]?.oc_class);
        const goldCarrier = findgold(monster.minvent)
            && (!oclass || oclass === COIN_CLASS);
        if (mimic || goldCarrier) {
            ++count;
            break;
        }
    }

    state.gk.known = clear_stale_map(
        !oclass ? MAXOCLASSES + 1 : oclass, 0, state,
    );

    if (!state.gk.known && !count) {
        if (!countHere) {
            if (detector)
                await strange_feeling(
                    detector, 'You feel a lack of something.', state,
                );
            return 1;
        }
        await ttyPline(`You sense ${description} nearby.`, state);
        return 0;
    }

    await cls();
    unconstrain_map(state);
    for (let obj = buriedObjects; obj; obj = obj.nobj) {
        const match = !oclass ? obj : o_in(obj, oclass, state);
        if (!match) continue;
        if (oclass && match !== obj) {
            match.ox = obj.ox;
            match.oy = obj.oy;
        }
        map_object(oclass ? match : obj, 1, state);
    }

    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            for (let obj = state.level.objects?.[x]?.[y] ?? null;
                obj; obj = obj.nexthere) {
                let match = (!oclass && !boulder) ? obj
                    : o_in(obj, oclass, state)
                        || o_in(obj, boulder, state);
                if (!match) continue;
                if ((oclass || boulder) && match !== obj) {
                    match.ox = obj.ox;
                    match.oy = obj.oy;
                }
                map_object(match, 1, state);
                break;
            }
        }
    }

    for (let monster = state.level?.monlist ?? null;
        monster; monster = monster.nmon) {
        if (monster.mhp < 1 || (monster.isgd && !monster.mx)) continue;
        for (let obj = monster.minvent ?? null; obj; obj = obj.nobj) {
            let match = (!oclass && !boulder) ? obj
                : o_in(obj, oclass, state) || o_in(obj, boulder, state);
            if (!match) continue;
            match.ox = monster.mx;
            match.oy = monster.my;
            map_object(match, 1, state);
            break;
        }
        if (detector?.cursed && M_AP_TYPE(monster) === M_AP_OBJECT
            && (!oclass
                || oclass === state.objects[monster.mappearance]?.oc_class)) {
            map_object({
                otyp: monster.mappearance,
                quan: 1,
                ox: monster.mx,
                oy: monster.my,
                corpsenm: has_mcorpsenm(monster)
                    ? monster.mextra.mcorpsenm : PM_TENGU,
            }, 1, state);
        } else if (findgold(monster.minvent)
            && (!oclass || oclass === COIN_CLASS)) {
            map_object({
                otyp: GOLD_PIECE,
                quan: rnd(10),
                ox: monster.mx,
                oy: monster.my,
            }, 1, state);
        }
    }

    const currentGlyph = glyph_at(state.u.ux, state.u.uy, state);
    if (!glyph_is_object(currentGlyph)) {
        newsym(state.u.ux, state.u.uy);
    }
    await ttyPline(
        `You detect the ${count ? 'presence' : 'absence'} of ${description}.`,
        state,
    );
    if (!count) note_unported('detect.c display_nhwindow');
    else note_unported('detect.c browse_map');
    await map_redisplay(state);
    return 0;
}

// C ref: detect.c monster_detect() (797-860), restricted to the fountain and
// other ordinary no-object, all-monster call. Potion/object-specific waking,
// monster-class filtering, constrained maps, and long-worm tails remain
// fail-closed rather than silently changing the detection result. Like the C
// helper, return 1 when nothing was detected and 0 after displaying monsters;
// the inverted result is consumed by fountain.c's fate-selection branch.
export async function monster_detect(
    otmp = null,
    mclass = 0,
    state = game,
    env = {},
) {
    const monsters = liveMonsters(state);
    if (!monsters.length) {
        if (otmp) {
            await strange_feeling(
                otmp,
                heroHallucinating(state)
                    ? 'You get the heebie jeebies.'
                    : 'You feel threatened.',
                state,
            );
        }
        return 1;
    }

    const clearScreen = env.cls ?? cls;
    const unconstraint = env.unconstrainMap ?? unconstrain_map;
    const showSelf = env.displaySelf ?? display_self;
    const message = env.message ?? ttyPline;
    const browse = env.browseMap ?? browse_map;
    const redisplay = env.mapRedisplay ?? map_redisplay;

    const swallowed = Boolean(state.u?.uswallow);
    await clearScreen();
    const unconstrained = unconstraint(state);
    let woken = false;
    for (const monster of monsters) {
        if (!mclass || monster.data?.mlet === mclass
            || (monster.data?.pmidx === PM_LONG_WORM
                && mclass === S_WORM_TAIL)) {
            map_monst(monster, state, env);
        }
        if (otmp?.cursed && helpless(monster)) {
            monster.msleeping = 0;
            monster.mfrozen = 0;
            monster.mcanmove = 1;
            woken = true;
        }
    }
    if (!swallowed) showSelf(state);
    await message('You sense the presence of monsters.', state);
    if (woken) await message('Monsters sense the presence of you.', state);

    if (otmp?.blessed && !unconstrained) {
        note_unported('detect.c display_nhwindow');
    } else {
        const detection = state.u.uprops[DETECT_MONSTERS] ??= {
            intrinsic: 0,
            extrinsic: 0,
        };
        detection.extrinsic |= I_SPECIAL;
        try {
            await browse(TER_DETECT | TER_MON, 'monster of interest', state);
        } finally {
            detection.extrinsic &= ~I_SPECIAL;
        }
    }
    await redisplay(state);
    return 0;
}

const OTRAP_NONE = 0;
const OTRAP_HERE = 1;
const OTRAP_THERE = 2;

// C refs: detect.c sense_trap()/detect_obj_traps()/display_trap_map()
// (865-1008). Crystal-ball detection reaches the ordinary, sighted, un-cursed
// map arm. Hallucinated/cursed fake-object feedback and findone()'s optional
// collection callback are kept explicit boundaries until their source helpers
// are included in a task that has matching entry evidence.
function sense_trap(trap, x, y, srcCursed, state = game) {
    if (trap) {
        map_trap(trap, 1, state);
        trap.tseen = true;
        return;
    }
    const dummyTrap = { tx: x, ty: y, ttyp: BEAR_TRAP };
    map_trap(dummyTrap, 1, state);
}

function show_sense_trap(trap, x, y, srcCursed, state = game) {
    if (heroHallucinating(state) || srcCursed) {
        // This call is void in C; do not invent the random_object()/
        // random_monster() result that the fake object requires.
        note_unported('detect.c sense_trap');
        return;
    }
    sense_trap(trap, x, y, srcCursed, state);
}

function detect_obj_traps(objlist, showThem, how, ft = null, state = game) {
    let result = OTRAP_NONE;
    for (let obj = objlist; obj; obj = obj.nobj) {
        let x = 0, y = 0;
        if ((Is_box(obj) && obj.otrapped) || Has_contents(obj)) {
            const location = get_obj_location(
                obj, BURIED_TOO | CONTAINED_TOO, state,
            );
            if (!location || !isok(location.x, location.y)
                || (ft && (location.x !== ft.ft_cc.x
                    || location.y !== ft.ft_cc.y))) {
                continue;
            }
            ({ x, y } = location);
        }
        if (Is_box(obj) && obj.otrapped) {
            obj.tknown = true;
            observe_object(obj, state);
            result |= u_at(x, y, state) ? OTRAP_HERE : OTRAP_THERE;
            if (showThem) {
                const dummyTrap = { tx: x, ty: y, ttyp: TRAPPED_CHEST };
                show_sense_trap(dummyTrap, x, y, how, state);
            }
            if (ft) {
                // findone() is outside this task's entry points; the C result
                // still includes this chest, while the optional flash/callback
                // feedback remains an explicit void gap.
                note_unported('detect.c detect_obj_traps findone feedback');
            }
        }
        if (Has_contents(obj))
            result |= detect_obj_traps(obj.cobj, showThem, how, ft, state);
    }
    return result;
}

async function display_trap_map(cursedSource, state = game) {
    await cls();
    unconstrain_map(state);
    detect_obj_traps(state.level?.buriedobjlist ?? null, true,
        cursedSource, null, state);
    detect_obj_traps(state.level?.objlist ?? null, true,
        cursedSource, null, state);
    for (let monster = state.level?.monlist ?? null;
        monster; monster = monster.nmon) {
        if (monster.mhp < 1 || (monster.isgd && !monster.mx)) continue;
        detect_obj_traps(monster.minvent, true, cursedSource, null, state);
    }
    detect_obj_traps(state.invent, true, cursedSource, null, state);
    for (const trap of state.level?.traps ?? [])
        show_sense_trap(trap, 0, 0, cursedSource, state);

    for (let index = 0; index < (state.level?.doorindex ?? 0); ++index) {
        const door = state.level.doors[index];
        if (state.level.at(door.x, door.y).typ === SDOOR) continue;
        if (state.level.at(door.x, door.y).doormask & D_TRAPPED) {
            show_sense_trap({ tx: door.x, ty: door.y, ttyp: TRAPPED_DOOR },
                door.x, door.y, cursedSource, state);
        }
    }

    const currentGlyph = glyph_at(state.u.ux, state.u.uy, state);
    if (!glyph_is_trap(currentGlyph) && !glyph_is_object(currentGlyph)) {
        newsym(state.u.ux, state.u.uy);
    }
    await ttyPline(cursedSource ? 'You feel very greedy.' : 'You feel entrapped.', state);
    // C browses all detector map types here. The existing browse_map port is
    // intentionally narrower, and its result is void at this source site.
    note_unported('detect.c browse_map');
    await map_redisplay(state);
}

// C ref: detect.c trap_detect() (1011-1086); its 1/0 result is consumed by
// use_crystal_ball().
async function trap_detect(sobj = null, state = game) {
    let found = false;
    const traps = state.level?.traps ?? [];
    const cursedSource = Boolean(sobj?.cursed);
    if (state.u.usteed) {
        state.u.usteed.mx = state.u.ux;
        state.u.usteed.my = state.u.uy;
    }
    for (const trap of traps) {
        if (trap.tx !== state.u.ux || trap.ty !== state.u.uy) {
            await display_trap_map(cursedSource, state);
            return 0;
        }
        found = true;
    }
    for (const chain of [state.level?.objlist ?? null,
        state.level?.buriedobjlist ?? null]) {
        const result = detect_obj_traps(chain, false, 0, null, state);
        if (result & OTRAP_THERE) {
            await display_trap_map(cursedSource, state);
            return 0;
        }
        if (result !== OTRAP_NONE) found = true;
    }
    for (let monster = state.level?.monlist ?? null;
        monster; monster = monster.nmon) {
        if (monster.mhp < 1 || (monster.isgd && !monster.mx)) continue;
        const result = detect_obj_traps(monster.minvent, false, 0, null, state);
        if (result & OTRAP_THERE) {
            await display_trap_map(cursedSource, state);
            return 0;
        }
        if (result !== OTRAP_NONE) found = true;
    }
    if (detect_obj_traps(state.invent, false, 0, null, state)
        !== OTRAP_NONE) found = true;
    for (let index = 0; index < (state.level?.doorindex ?? 0); ++index) {
        const door = state.level.doors[index];
        const location = state.level.at(door.x, door.y);
        if (location.typ === SDOOR) continue;
        if (location.doormask & D_TRAPPED) {
            if (door.x !== state.u.ux || door.y !== state.u.uy) {
                await display_trap_map(cursedSource, state);
                return 0;
            }
            found = true;
        }
    }
    if (!found) {
        const message = `Your ${makeplural(body_part(TOE, state.youmonst))} stop itching.`;
        await strange_feeling(null, message, state);
        return 1;
    }
    await ttyPline(
        `Your ${makeplural(body_part(TOE, state.youmonst))} itch.`, state,
    );
    return 0;
}

// C ref: detect.c furniture_detect() (1091-1138); this consumes and returns 0.
async function furniture_detect(state = game) {
    let found = 0, revealed = 0;
    unconstrain_map(state);
    for (let y = 0; y < ROWNO; ++y) {
        for (let x = 1; x < COLNO; ++x) {
            const glyph = glyph_at(x, y, state);
            const symbol = glyph_to_cmap(glyph);
            const location = state.level.at(x, y);
            const monster = m_at(x, y, state);
            if (IS_FURNITURE(location.typ)) {
                ++found;
                magic_map_background(x, y, 1, state);
            } else if (symbol >= S_upstair && symbol <= S_fountain) {
                ++found;
                if (monster && M_AP_TYPE(monster) === M_AP_FURNITURE)
                    monSeemimic(monster, state);
                if (!monster || !canSpotMonster(monster, state))
                    map_invisible(x, y, state);
            }
            if (glyph_at(x, y, state) !== glyph) ++revealed;
        }
    }
    if (!found) await ttyPline('There seems to be nothing of interest on this level.', state);
    else if (!revealed)
        await ttyPline('Your map already shows all relevant locations.', state);
    if (!revealed) note_unported('detect.c display_nhwindow');
    else {
        note_unported('detect.c browse_map');
    }
    await map_redisplay(state);
    return 0;
}

// C ref: detect.c map_redisplay() (94-103). Restore the saved map constraints
// before redrawing; display.c's specialized underwater and buried overlays are
// void callees outside this task and remain named gaps.
export async function map_redisplay(state = game) {
    if (state !== game)
        throw new TypeError('map_redisplay() redraws the global game');
    reconstrain_map(state);
    await docrt();
    if (state.u.uinwater) note_unported('display.c under_water');
    if (state.u.uburied) note_unported('display.c under_ground');
}

// C ref: detect.c level_distance() (1142-1173). The two randomized threshold
// checks are kept under their exact short-circuit conditions.
export function level_distance(where, state = game, random = { rn2 }) {
    const distance = depth(state.u.uz, state) - depth(where, state);
    const sameDungeon = state.u.uz.dnum === where.dnum;
    let result = '';
    if (distance < 0) {
        if (distance < (-8 - random.rn2(3)))
            result = sameDungeon ? 'far below' : 'far away';
        else if (distance < -1)
            result = sameDungeon ? 'below you' : 'away below you';
        else
            result = sameDungeon ? 'just below' : 'in the distance';
    } else if (distance > 0) {
        if (distance > (8 + random.rn2(3)))
            result = sameDungeon ? 'far above' : 'far away';
        else if (distance > 1)
            result = sameDungeon ? 'above you' : 'away above you';
        else
            result = sameDungeon ? 'just above' : 'in the distance';
    } else {
        result = sameDungeon ? 'near you' : 'in the distance';
    }
    return result;
}

function heroBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean((blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked);
}

function heroHallucinating(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(hallucination?.intrinsic)
        && !Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

function halfPhysicalDamage(damage, state) {
    const half = state.u?.uprops?.[HALF_PHDAM];
    return half?.intrinsic || half?.extrinsic
        ? Math.trunc((damage + 1) / 2) : damage;
}

// C ref: detect.c use_crystal_ball() (1206-1371). `optr` is the JavaScript
// equivalent of C's `struct obj **`: useup() mutates the inventory chain and
// this holder is cleared on the two source branches that destroy the ball.
export async function use_crystal_ball(optr, state = game) {
    let obj = optr.obj;
    const charged = obj.spe > 0;
    if (heroBlind(state)) {
        await ttyPline(
            `Too bad you can't see ${the(xnameFresh(obj, state), state)}.`,
            state,
        );
        return;
    }

    const oops = is_quest_artifact(obj, state) ? 8
        : obj.blessed ? 16 : 20;
    if (charged && (obj.cursed || rnd(oops) > acurr(state, A_INT))) {
        const impairment = rnd(100 - 3 * acurr(state, A_INT));
        const maxCase = obj.oartifact || obj.blessed ? 4 : 5;
        switch (rnd(maxCase)) {
        case 1:
            await ttyPline(
                `${Tobjnam(obj, 'are', state)} too much to comprehend!`,
                state,
            );
            break;
        case 2:
            await ttyPline(`${Tobjnam(obj, 'confuse', state)} you!`, state);
            await make_confused(
                ((state.u.uprops[CONFUSION]?.intrinsic ?? 0) & TIMEOUT)
                    + impairment,
                false,
                state,
            );
            break;
        case 3:
            if (!resists_blnd(state.youmonst, state)) {
                await ttyPline(
                    `${Tobjnam(obj, 'damage', state)} your vision!`, state,
                );
                const oldBlind = heroBlind(state);
                const blindTimeout = (state.u.uprops[BLINDED]?.intrinsic ?? 0)
                    & TIMEOUT;
                await make_blinded(blindTimeout + impairment, false, state);
                if (!heroBlind(state) && oldBlind)
                    await ttyPline('Your vision clears.', state);
            } else {
                await ttyPline(
                    `${Tobjnam(obj, 'assault', state)} your vision.`, state,
                );
                await ttyPline('You are unaffected!', state);
            }
            break;
        case 4:
            await ttyPline(`${Tobjnam(obj, 'zap', state)} your mind!`, state);
            await make_hallucinated(
                ((state.u.uprops[HALLUC]?.intrinsic ?? 0) & TIMEOUT)
                    + impairment,
                false,
                0,
                state,
            );
            break;
        case 5:
            await ttyPline(`${Tobjnam(obj, 'explode', state)}!`, state);
            useup(obj, { state });
            optr.obj = obj = null;
            await losehp(
                halfPhysicalDamage(rnd(30), state),
                'exploding crystal ball', KILLED_BY_AN, state,
            );
            break;
        }
        if (obj) consume_obj_charge(obj, true, { state });
        return;
    }

    if (heroHallucinating(state)) {
        nomul(-rnd(charged ? 4 : 2), state);
        state.multi_reason = 'gazing into a Magic 8-Ball (tm)';
        state.nomovemsg = '';
        if (!charged) {
            await ttyPline(
                `All you see is funky ${hcolor(null, state)} haze.`, state,
            );
            if (obj.spe < 0) {
                await ttyPline(`${Tobjnam(obj, 'implode', state)}!`, state);
                useup(obj, { state });
                optr.obj = null;
            }
        } else {
            switch (rnd(6)) {
            case 1:
                await ttyPline('You grok some groovy globs of incandescent lava.', state);
                break;
            case 2:
                await ttyPline(
                    `Whoa! Psychedelic colors, ${poly_gender(state) === 1 ? 'babe' : 'dude'}!`,
                    state,
                );
                break;
            case 3:
                await ttyPline(
                    `The crystal pulses with sinister ${hcolor(null, state)} light!`,
                    state,
                );
                break;
            case 4:
                await ttyPline('You see goldfish swimming above fluorescent rocks.', state);
                break;
            case 5:
                await ttyPline(
                    'You see tiny snowflakes spinning around a miniature farmhouse.',
                    state,
                );
                break;
            default:
                await ttyPline('Oh wow... like a kaleidoscope!', state);
                break;
            }
            consume_obj_charge(obj, true, { state });
        }
        return;
    }

    if (state.flags?.verbose)
        await ttyPline('You may look for an object, monster, or special map symbol.', state);
    const answer = await yn_function(
        'What do you look for?', null, '\0', true, state,
    );
    let ch = typeof answer === 'number'
        ? String.fromCharCode(answer) : String(answer ?? '');
    const ghostSymbol = String.fromCharCode(
        DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_M + S_GHOST],
    );
    if (ch !== ghostSymbol && quitchars.includes(ch)) {
        if (state.flags?.verbose) await ttyPline(Never_mind, state);
        return;
    }

    await ttyPline(
        `You peer into ${the(xnameFresh(obj, state), state)}...`, state,
    );
    nomul(-rnd(charged ? 10 : 2), state);
    state.multi_reason = 'gazing into a crystal ball';
    state.nomovemsg = '';
    if (!charged) {
        await ttyPline('The vision is unclear.', state);
        if (obj.spe < 0) {
            await ttyPline(`${Tobjnam(obj, 'implode', state)}!`, state);
            useup(obj, { state });
            optr.obj = obj = null;
            return;
        }
    } else {
        let detected = 0;
        // hack.h makeknown(x) sets both knowledge flags and credits the
        // Wisdom exercise when this is the first use of a crystal ball. C
        // calls makeknown before consuming the ball's charge.
        discover_object(CRYSTAL_BALL, true, true, true, state);
        consume_obj_charge(obj, true, { state });
        if (ch === ']') ch = DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_M + S_MIMIC];
        if (def_char_is_furniture(ch) >= 0) {
            detected = await furniture_detect(state);
        } else {
            const objectClass = def_char_to_objclass(ch);
            if (objectClass !== MAXOCLASSES) {
                detected = await object_detect(null, objectClass, state);
            } else {
                const monsterClass = def_char_to_monclass(ch);
                if (monsterClass !== MAXMCLASSES) {
                    detected = await monster_detect(null, monsterClass, state);
                } else {
                    const boulderChar = state.gs?.showsyms?.[
                        SYM_OFF_X + SYM_BOULDER
                    ];
                    if (boulderChar && ch === String.fromCharCode(boulderChar)) {
                        detected = await object_detect(null, ROCK_CLASS, state);
                    } else if (ch === '^') {
                        detected = await trap_detect(null, state);
                    } else {
                        const levels = [
                            ['Delphi', state.oracle_level],
                            ["Medusa's lair", state.medusa_level],
                            ['a castle', state.stronghold_level],
                            ["the Wizard of Yendor's tower", state.wiz1_level],
                        ];
                        const [name, where] = levels[rn2(levels.length)];
                        await ttyPline(
                            `You see ${name}, ${level_distance(where, state)}.`,
                            state,
                        );
                        detected = 0;
                    }
                }
            }
        }
        if (detected) {
            if (!rn2(100))
                await ttyPline('You see the Wizard of Yendor gazing out at you.', state);
            else
                await ttyPline('The vision is unclear.', state);
        }
    }
}

// C ref: detect.c reveal_terrain() (2356-2413), now through its ordinary
// browse_map()/getpos()/map_redisplay path. Other menu choices and
// disoriented or constrained heroes remain deliberately fail-closed above.
export async function reveal_terrain(whichSubset, state = game) {
    if (whichSubset !== TER_MAP) {
        throw new UnsupportedSearchError(
            'terrain menu choice is not ported',
        );
    }
    if (hallucinating(state)
        || propertyActiveUnblocked(state.u, STUNNED)
        || propertyActiveUnblocked(state.u, CONFUSION)) {
        throw new UnsupportedSearchError(
            'disoriented terrain projection',
        );
    }
    if (state !== game)
        throw new TypeError('reveal_terrain() redraws the global game');

    const swallowed = Boolean(state.u?.uswallow);
    const defaultSym = state.level?.flags?.arboreal ? S_tree : S_stone;
    const defaultGlyph = cmap_to_glyph(defaultSym, state);
    if (unconstrain_map(state)) docrt();

    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const glyph = reveal_terrain_getglyph(
                x, y, swallowed, defaultGlyph, whichSubset, state,
            );
            show_glyph_cell(x, y, terrainGlyphInfo(glyph, state));
        }
    }

    await flush_screen(1);
    await ttyPline('Showing known terrain only...', state);
    await browse_map(whichSubset, 'anything of interest', state);
    await map_redisplay(state);
}

function glyphIsTrap(glyph) {
    if (!Number.isInteger(glyph)) return false;
    // display.h GLYPH_TRAP_OFF is cmap_to_glyph(S_arrow_trap).
    const first = cmap_to_glyph(S_arrow_trap, game);
    return glyph >= first && glyph < first + MAXTCHARS;
}

// C ref: detect.c show_map_spot() (1372-1422), ordinary unconfused mapping.
export function show_map_spot(x, y, cnf, state = game) {
    if (state !== game)
        throw new TypeError('show_map_spot() redraws the global game');
    if (cnf) {
        throw new UnsupportedSearchError('confused magic mapping');
    }
    const location = state.level.at(x, y);
    location.seenv = SVALL;
    if (location.typ === SCORR) {
        location.typ = CORR;
        unblock_point(x, y, state);
    }
    const oldglyph = glyph_at(x, y, state);
    magic_map_background(x, y, 0, state);
    newsym(x, y);
    if (!IS_FURNITURE(location.typ)) {
        const trap = t_at(x, y, state);
        const engraving = engr_at(x, y, state);
        if (trap?.tseen) {
            map_trap(trap, 1, state);
        } else if (engraving) {
            map_engraving(engraving, 1, state);
        } else if (glyphIsTrap(oldglyph) || glyph_is_object(oldglyph)) {
            const glyph = map_glyphinfo(oldglyph, state);
            show_glyph_cell(x, y, glyph);
            location.remembered_glyph
                = remembered_glyph_from_presentation(glyph);
        }
    }
    if (location.roomno >= ROOMOFFSET)
        room_discovered(location.roomno - ROOMOFFSET, state);
}

// C ref: detect.c do_mapping() (1424-1444), ordinary hero-memory arm.
export async function do_mapping(state = game) {
    if (!state.level?.flags?.hero_memory) {
        throw new UnsupportedSearchError('magic mapping without hero memory');
    }
    unconstrain_map(state);
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y)
            show_map_spot(x, y, false, state);
    }
    reconstrain_map(state);
    await exercise(A_WIS, true, state, { rn2 });
}

function propertyActiveUnblocked(hero, propertyIndex) {
    const property = hero?.uprops?.[propertyIndex];
    return Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked;
}

function hallucinating(state) {
    return propertyActiveUnblocked(state.u, HALLUC)
        && !propertyActiveUnblocked(state.u, HALLUC_RES);
}

function compassDescription(x, y, state, full) {
    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    if (!dx && !dy) return '(here)';
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        const vertical = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
        const horizontal = dx < 0 ? 'west' : dx > 0 ? 'east' : '';
        return `(${vertical}${horizontal})`;
    }

    const parts = [];
    if (dy) {
        const direction = dy < 0 ? (full ? 'north' : 'n')
            : (full ? 'south' : 's');
        parts.push(`${Math.abs(dy)}${direction}`);
    }
    if (dx) {
        const direction = dx < 0 ? (full ? 'west' : 'w')
            : (full ? 'east' : 'e');
        parts.push(`${Math.abs(dx)}${direction}`);
    }
    return `(${parts.join(',')})`;
}

// C ref: getpos.c coord_desc(), as used by pline.c for set_msg_xy().
function coordinateDescription(x, y, state) {
    const configured = state.iflags?.getpos_coords ?? GPCOORDS_NONE;
    const mode = configured === GPCOORDS_NONE
        ? GPCOORDS_COMFULL : configured;
    if (mode === GPCOORDS_COMPASS)
        return compassDescription(x, y, state, false);
    if (mode === GPCOORDS_COMFULL)
        return compassDescription(x, y, state, true);
    if (mode === GPCOORDS_MAP) return `<${x},${y}>`;
    if (mode === GPCOORDS_SCREEN) {
        return `[${String(y + 2).padStart(2, '0')},${String(x).padStart(2, '0')}]`;
    }
    return '';
}

export async function defaultSearchMessage(text, x, y, env) {
    const rendered = env.state.a11y?.accessiblemsg
        ? `${coordinateDescription(x, y, env.state)}: ${text}`
        : text;
    await ttyPline(rendered, env.state);
}

function defaultVisionMutation(x, y, env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected vision mutation '
            + 'for non-global state',
        );
    }
    const affectedCurrentVision = Boolean(env.state.viz_array?.[y]?.[x]);
    // vision.c updates its transparent-point index immediately.  The current
    // JS vision owner rebuilds that index as a unit rather than exposing
    // dig_point()/fill_point().
    const oldVisionMin = env.state._viz_rmin;
    const oldVisionMax = env.state._viz_rmax;
    vision_reset();
    // vision_reset() is normally a level-lifecycle operation and clears the
    // previous display bounds.  A point mutation happens mid-level, so retain
    // them for vision_recalc() to erase cells which just left sight.
    env.state._viz_rmin = oldVisionMin;
    env.state._viz_rmax = oldVisionMax;
    if (affectedCurrentVision) env.state.vision_full_recalc = 1;
}

function defaultSearchDisplay(x, y, env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected display mutation '
            + 'for non-global state',
        );
    }
    // C's newsym() is side-effect-only. find_trap() then compares levl's
    // canonical remembered glyph, not the presentation currently covering it.
    newsym(x, y);
}

// C ref: detect.c mfind0()'s map_invisible() call.  The display owner keeps
// both the live and clone memory writes; the explicit planning seam selects
// its no-paint half for a cloned level.
function defaultMapInvisible(x, y, env) {
    if (env.state === game) {
        map_invisible(x, y, env.state);
        return;
    }
    map_invisible_planning(x, y, env.state);
}

async function silentSearchMessage() {}

async function defaultDisplayPendingTtyMessageWindow(env) {
    // display_nhwindow(WIN_MESSAGE, FALSE) is a live TTY operation. A search
    // planning clone owns its message state but must neither consume live
    // input nor retire the live message window.
    if (env.planning || env.state !== game) return;
    await displayPendingTtyMessageWindow(env.state);
}

// C ref: display.c _map_location().  Every location admitted by this
// automatic-search owner is a converted adjacent door/corridor or an ordinary
// floor trap, so the reachable layer order is object, seen trap, terrain.
// The trap identity that used to travel beside the presentation is gone with
// the presentation: display.h trap_to_glyph() gives each trap type its own
// glyph number, so the number map memory stores names the trap on its own.
function mappedSearchLayer(x, y, state) {
    const object = state.level.objects?.[x]?.[y] ?? null;
    if (object) return object_glyph_info(object, state);
    const trap = t_at(x, y, state);
    if (trap?.tseen) return trap_glyph_info(trap, state);
    return map_glyphinfo(back_to_glyph(x, y, state), state);
}

// C ref: display.c feel_location(), as called by detect.c's explicit-search
// blind/visible-region arm. Keep the canonical display owner here rather than
// maintaining a second tactile map implementation in detect.js.
function defaultFeelSearchLocation(x, y, env) {
    const { state } = env;
    return feel_location(x, y, state);
}

function defaultFeelSearchNewSym(x, y, env) {
    if (propertyActiveUnblocked(env.state.u, BLINDED)) {
        defaultFeelSearchLocation(x, y, env);
        return;
    }
    defaultSearchDisplay(x, y, env);
}

async function defaultFoundTrapDisplay(trap, x, y, env) {
    const layer = await env.feelNewSym(x, y, env);
    if (!env.injected.has('feelNewSym')) {
        const remembered = env.state.level.at(x, y).remembered_glyph;
        return Boolean(
            env.state.level.flags?.hero_memory
            && remembered?.glyph === trap_to_glyph(trap, env.state),
        );
    }
    if (layer?.kind) {
        return Boolean(
            env.state.level.flags?.hero_memory
            && layer.kind === 'trap'
            && (layer.owner === trap || layer.trapType === trap.ttyp),
        );
    }
    // Preserve the injected-hook fallback contract for focused callers which
    // supply presentation but not a logical layer descriptor.
    const shown = env.state.level.at(x, y);
    const expected = trap_glyph_info(trap, env.state);
    return shown.disp_ch === expected.ch
        && shown.disp_color === expected.color
        && Boolean(shown.disp_decgfx) === Boolean(expected.dec);
}

async function defaultRevealFoundTrap(trap, env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected trap reveal '
            + 'for non-global state',
        );
    }
    await cls();
    // C ref: detect.c find_trap() calls map_trap(trap, 1), not merely
    // show_glyph().  The discovered trap must survive the following docrt(),
    // including when WIN_STOP suppresses the message's --More-- wait.
    map_trap(trap, 1, env.state);
    const heroGlyph = hero_glyph_info(env.state);
    show_glyph_cell(env.state.u.ux, env.state.u.uy, heroGlyph);
}

async function defaultWaitFoundTrap(env) {
    if (env.state !== game) {
        throw new Error(
            'automatic search requires an injected trap-map wait '
            + 'for non-global state',
        );
    }
    // C ref: win/tty/wintty.c tty_display_nhwindow(NHW_MAP, TRUE).
    // A pending find_trap() message is presented through more(), whose key
    // wait and topline cleanup are owned by the tty message subsystem.
    // WIN_STOP suppresses that message and therefore the wait, but find_trap()
    // still continues to docrt().
    const messageWasStopped = Boolean(env.state._ttyMessageStopped);
    if (!await dismissPendingTtyMessage(env.state) && !messageWasStopped) {
        throw new Error(
            'automatic search trap-map wait requires its pending tty message',
        );
    }
    await docrt();
}

async function defaultExerciseWisdom(env) {
    await exercise(A_WIS, true, env.state, env.random, env.hooks);
}

function injectedOperation(rawEnv, name) {
    return rawEnv[name] ?? rawEnv.hooks?.[name];
}

function normalizeSearchEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? (state === game ? { rn2, rnl } : {});

    const injected = new Set();
    const operation = (name, fallback) => {
        const supplied = injectedOperation(rawEnv, name);
        if (typeof supplied === 'function') {
            injected.add(name);
            return supplied;
        }
        return fallback;
    };

    const env = {
        ...rawEnv,
        state,
        random,
        hooks: rawEnv.hooks ?? {},
        injected,
        recalcBlockPoint: operation(
            'recalcBlockPoint',
            defaultVisionMutation,
        ),
        unblockPoint: operation('unblockPoint', defaultVisionMutation),
        feelLocation: operation(
            'feelLocation',
            defaultFeelSearchLocation,
        ),
        feelNewSym: operation(
            'feelNewSym',
            defaultFeelSearchNewSym,
        ),
        // detect.c mfind0()'s bare newsym(), which is not routed through
        // feel_location() the way the two secret-terrain arms are.
        newSym: operation('newSym', defaultSearchDisplay),
        mapInvisible: operation('mapInvisible', defaultMapInvisible),
        seemimic: operation(
            'seemimic',
            (monster, mimicEnv) => monSeemimic(
                monster,
                state,
                mimicEnv,
            ),
        ),
        displayFoundTrap: operation(
            'displayFoundTrap',
            defaultFoundTrapDisplay,
        ),
        revealFoundTrap: operation(
            'revealFoundTrap',
            defaultRevealFoundTrap,
        ),
        waitFoundTrap: operation('waitFoundTrap', defaultWaitFoundTrap),
        activateStatueTrap: operation('activateStatueTrap', null),
        exerciseWisdom: operation(
            'exerciseWisdom',
            defaultExerciseWisdom,
        ),
        // detect.c calls nomul(0) at 2048, 2058 and 2080, which js/hack.js
        // owns along with the end_running(TRUE) inside it.
        nomulZero: operation('nomulZero', ({ state }) => nomul(0, state)),
        // The live fallback is the coordinate-aware pline path. A planning
        // clone gets a silent operation without becoming an injected caller,
        // so preflightTrap() keeps its source wait contract unchanged.
        message: operation(
            'message',
            state === game && !rawEnv.planning
                ? defaultSearchMessage : silentSearchMessage,
        ),
        displayPendingTtyMessageWindow: operation(
            'displayPendingTtyMessageWindow',
            defaultDisplayPendingTtyMessageWindow,
        ),
        // C ref: detect.c:1956, trapname(trap->ttyp, FALSE). A hallucinating
        // hero needs the branch js/trap.js trapname() leaves unported, which
        // requireInjected() above demands an injection for, so the default
        // only ever formats the true name.
        trapName: operation('trapName', (trap) => trapname(trap.ttyp)),
    };
    return env;
}

function requireOperation(env, name, detail) {
    if (typeof env[name] !== 'function') {
        throw new Error(
            `automatic search requires ${name}${detail ? ` for ${detail}` : ''}`,
        );
    }
}

function requireInjected(env, name, detail) {
    if (!env.injected.has(name)) {
        throw new Error(
            `automatic search requires an injected ${name} for ${detail}`,
        );
    }
}

function requireExerciseRandom(env) {
    if (!env.injected.has('exerciseWisdom')
        && typeof env.random.rn2 !== 'function') {
        throw new TypeError(
            'automatic search wisdom exercise requires random.rn2',
        );
    }
}

function validateDisplayCapability(env, name, detail) {
    requireOperation(env, name, detail);
    if (env.state !== game) requireInjected(env, name, 'non-global state');
}

function preflightSecretDoor(env) {
    requireOperation(env, 'recalcBlockPoint', 'a secret door');
    validateDisplayCapability(env, 'feelLocation', 'a secret door');
    requireOperation(env, 'exerciseWisdom', 'a secret door');
    requireExerciseRandom(env);
    requireOperation(env, 'nomulZero', 'a secret door');
    requireOperation(env, 'message', 'a secret door');
}

function preflightSecretCorridor(env) {
    requireOperation(env, 'unblockPoint', 'a secret corridor');
    validateDisplayCapability(env, 'feelNewSym', 'a secret corridor');
    requireOperation(env, 'exerciseWisdom', 'a secret corridor');
    requireExerciseRandom(env);
    requireOperation(env, 'nomulZero', 'a secret corridor');
    requireOperation(env, 'message', 'a secret corridor');
}

function preflightTrap(env, trap) {
    requireOperation(env, 'nomulZero', 'an unseen trap');
    requireOperation(env, 'exerciseWisdom', 'an unseen trap');
    requireExerciseRandom(env);
    if (trap.ttyp === STATUE_TRAP) {
        requireOperation(env, 'activateStatueTrap', 'a statue trap');
        return;
    }
    validateDisplayCapability(env, 'displayFoundTrap', 'an unseen trap');
    requireOperation(env, 'message', 'an unseen trap');
    requireOperation(env, 'trapName', 'an unseen trap');
    if (env.injected.has('message')
        && !env.injected.has('waitFoundTrap')) {
        throw new Error(
            'automatic search requires an injected waitFoundTrap '
            + 'when trap messaging is injected',
        );
    }
    if (env.state !== game) {
        requireInjected(
            env, 'revealFoundTrap', 'non-global trap display',
        );
        requireInjected(
            env, 'waitFoundTrap', 'non-global trap display',
        );
    }
    if (hallucinating(env.state)) {
        requireInjected(
            env, 'displayFoundTrap', 'hallucinatory trap display',
        );
        requireInjected(
            env, 'trapName', 'hallucinatory trap naming',
        );
        requireOperation(
            env, 'revealFoundTrap', 'hallucinatory trap display',
        );
        requireOperation(
            env, 'waitFoundTrap', 'hallucinatory trap display',
        );
    }
}

/**
 * Validate the operations mfind0() can use before explicit search spends its
 * first random draw.  The discovery branches themselves are source-owned now;
 * this check only verifies their operation seams, so a mimic, hidden hider,
 * or unspotted monster is allowed to reach the corresponding C behavior.
 */
function preflightSearchMonster(monster, env) {
    validateDisplayCapability(env, 'newSym', 'an adjacent monster');
    requireOperation(env, 'exerciseWisdom', 'an adjacent monster');
    requireOperation(env, 'message', 'an adjacent monster');
    requireOperation(env, 'mapInvisible', 'an unseen adjacent monster');
    if (M_AP_TYPE(monster))
        requireOperation(env, 'seemimic', 'a mimicking adjacent monster');
}

/**
 * C ref: the aflag == 0 arms of detect.c dosearch0(), plus every capability
 * its loop body needs.
 *
 * dosearch0() draws rnl() once per adjacent square inside its loop, so a case
 * this port cannot finish has to be refused over the whole 3x3 before the
 * first draw.  A refusal decided at the fifth square would already have spent
 * randomness on the first four and could not be retried.
 */
function preflightExplicitSearch(env) {
    const { state } = env;
    const { u } = state;
    // detect.c:2020-2022 answers a swallowed hero through Norep().
    if (u.uswallow) {
        throw new UnsupportedSearchError(
            'searching while swallowed is not ported',
        );
    }
    for (let x = u.ux - 1; x < u.ux + 2; ++x) {
        for (let y = u.uy - 1; y < u.uy + 2; ++y) {
            if (!isok(x, y) || (x === u.ux && y === u.uy)) continue;
            const location = state.level.at(x, y);
            // detect.c deliberately finds nothing else on an SDOOR or SCORR.
            if (location.typ === SDOOR) {
                preflightSecretDoor(env);
                continue;
            }
            if (location.typ === SCORR) {
                preflightSecretCorridor(env);
                continue;
            }
            const monster = m_at(x, y, state);
            if (monster) preflightSearchMonster(monster, env);
            // detect.c:2076-2077's unmap_invisible() needs no preflight: both
            // of its arms are ported now, and neither draws.
            const trap = t_at(x, y, state);
            if (trap && !trap.tseen) {
                // Two source branches the port does not own. They are refused
                // here, with the class js/cmd.js failClosedCommand() converts
                // into a retryable command boundary, rather than inside
                // preflightTrap(). That function's other checks catch a
                // misconfigured env rather than an unported branch.
                //
                // detect.c:2079-2088 is the one block dosearch0() does not
                // gate on aflag, so the automatic arm reaches these same two
                // branches and refuses them from preflightTrap() as plain
                // Errors, after the rnl(8) that selected the square. Those two
                // escape runSegment() rather than ending a segment, because
                // the turn loop converts nothing; neither is reachable by a
                // case this port can record today, and js/allmain.js records
                // that derivation beside the automatic call.
                if (trap.ttyp === STATUE_TRAP) {
                    throw new UnsupportedSearchError(
                        'detect.c activate_statue_trap() is not ported',
                    );
                }
                if (hallucinating(state)) {
                    throw new UnsupportedSearchError(
                        "detect.c find_trap()'s hallucinatory display is not "
                        + 'ported',
                    );
                }
                preflightTrap(env, trap);
            }
        }
    }
}

/** C ref: detect.c mfind0() (1967-2013), including both callers' flags. */
async function mfind0(monster, via_warning, env) {
    const { state } = env;
    const x = monster.mx;
    const y = monster.my;
    if (via_warning && !warning_of(monster, state)) return -1;

    let foundSomething = false;
    if (M_AP_TYPE(monster)) {
        // display.c seemimic() has a discarded return in C, but its map and
        // monster state changes are observable, so pass the search seams into
        // the existing complete owner rather than replacing them with a gap.
        await env.seemimic(monster, {
            ...env,
            newsym: (sx, sy) => env.newSym(sx, sy, env),
            unblockPoint: (sx, sy) => env.unblockPoint(sx, sy, env),
        });
        foundSomething = true;
    } else {
        // This is intentionally sampled before mundetected is cleared, as in
        // C's `found_something = !canspotmon(mtmp)`.
        foundSomething = !canSpotMonster(monster, state);
        if (monster.mundetected
            && (is_hider(monster.data) || hides_under(monster.data)
                || monster.data?.mlet === S_EEL)) {
            if (via_warning && foundSomething) {
                await env.message(
                    `Your danger sense causes you to take a second ${
                        propertyActiveUnblocked(state.u, BLINDED)
                            ? 'to check nearby' : 'look close by'}.`,
                    x,
                    y,
                    env,
                );
                // detect.c mfind0(): display_nhwindow(WIN_MESSAGE, FALSE)
                // flushes this warning before mundetected/newsym continue.
                await env.displayPendingTtyMessageWindow(env);
            }
            monster.mundetected = 0;
            foundSomething = true;
        }
        await env.newSym(x, y, env);
    }

    if (!foundSomething) return 0;

    const spotted = canSpotMonster(monster, state);
    if (!spotted && glyph_is_invisible(
        state.level.at(x, y).remembered_glyph?.glyph,
    )) return -1;

    await env.exerciseWisdom(env);
    if (!spotted) {
        await env.mapInvisible(x, y, env);
        await env.message('You feel an unseen monster!', x, y, env);
    } else if (!sensesMonster(monster, state)) {
        const name = monster.mtame
            ? y_monnam(monster, state, env)
            : a_monnam(monster, { ...env, state });
        await env.message(`You find ${name}.`, x, y, env);
    }
    return 1;
}

/** C ref: detect.c warnreveal() (2107-2119). */
export async function warnreveal(rawEnv = {}) {
    const env = normalizeSearchEnv(rawEnv);
    const { state } = env;
    for (let x = state.u.ux - 1; x <= state.u.ux + 1; ++x) {
        for (let y = state.u.uy - 1; y <= state.u.uy + 1; ++y) {
            if (!isok(x, y) || u_at(x, y, state)) continue;
            const monster = m_at(x, y, state);
            if (monster && warning_of(monster, state)
                && monster.mundetected) {
                // C discards this return; the reveal/message side effects are
                // retained by mfind0() itself.
                await mfind0(monster, 1, env);
            }
        }
    }
}

function artifactSearchAbility(object, state) {
    if (!object?.oartifact) return false;
    const artifact = state.artilist?.[object.oartifact];
    if (!artifact) {
        throw new Error(
            `automatic search cannot resolve artifact ${object.oartifact}`,
        );
    }
    return Boolean(artifact.spfx & SPFX_SEARCH);
}

function searchFund(state) {
    let fund = artifactSearchAbility(state.uwep, state)
        ? Math.trunc(state.uwep.spe ?? 0) : 0;
    if (state.ublindf?.otyp === LENSES
        && !propertyActiveUnblocked(state.u, BLINDED)) {
        fund += 2;
    }
    return Math.min(fund, 5);
}

// C ref: detect.c cvt_sdoor_to_door(). `flags` is struct rm's canonical
// union slot; doormask is updated with it for older JS state fixtures.
export function cvt_sdoor_to_door(location, state = game) {
    if (!location || location.typ !== SDOOR) {
        throw new TypeError('cvt_sdoor_to_door requires a secret door');
    }
    const oldmask = location.flags || location.doormask || 0;
    let newmask = oldmask & ~WM_MASK;
    if (on_level(state.u?.uz, state.rogue_level)) {
        newmask = D_NODOOR;
    } else if (!(newmask & D_LOCKED)) {
        newmask |= D_CLOSED;
    }
    location.typ = DOOR;
    location.flags = newmask;
    location.doormask = newmask;
    location.candig = false;
    return location;
}

function trappedBoxInChain(first, nextKey) {
    for (let object = first; object; object = object[nextKey] ?? null) {
        if (isBox(object) && object.otrapped) return true;
        if (object.cobj && trappedBoxInChain(object.cobj, 'nobj')) return true;
    }
    return false;
}

function trappedBoxInDirectChain(first, nextKey) {
    for (let object = first; object; object = object[nextKey] ?? null) {
        if (isBox(object) && object.otrapped) return true;
    }
    return false;
}

// C ref: detect.c trapped_chest_at(), for the sighted, non-hallucinating
// whatis caller. The hallucination disguise branch remains outside that
// command boundary because it consumes display RNG.
export function trapped_chest_at(ttyp, x, y, state = game) {
    if (!glyph_is_trap(glyph_at(x, y, state))) return false;
    if (ttyp !== TRAPPED_CHEST) return false;
    if (sobj_at(CHEST, x, y, state) || sobj_at(LARGE_BOX, x, y, state))
        return true;
    if (u_at(x, y, state)) {
        if (trappedBoxInDirectChain(state.invent, 'nobj')) return true;
        if (trappedBoxInDirectChain(state.u?.usteed?.minvent, 'nobj'))
            return true;
    }
    return trappedBoxInDirectChain(m_at(x, y, state)?.minvent, 'nobj');
}

// C ref: detect.c trapped_door_at(), for the same ordinary whatis caller.
export function trapped_door_at(ttyp, x, y, state = game) {
    if (!glyph_is_trap(glyph_at(x, y, state))) return false;
    if (ttyp !== TRAPPED_DOOR) return false;
    const location = state.level?.at(x, y);
    if (location?.typ !== DOOR) return false;
    const mask = location.flags ?? location.doormask ?? 0;
    if (mask & (D_NODOOR | D_BROKEN | D_ISOPEN)
        && trapped_chest_at(ttyp, x, y, state)) {
        return false;
    }
    return true;
}

function trappedBuriedBoxAt(x, y, state) {
    for (let object = state.level?.buriedobjlist ?? null;
        object;
        object = object.nobj ?? null) {
        if (object.ox !== x || object.oy !== y) continue;
        if ((isBox(object) && object.otrapped)
            || (object.cobj && trappedBoxInChain(object.cobj, 'nobj'))) {
            return true;
        }
    }
    return false;
}

// C ref: detect.c findone(), restricted to its no-discovery result. Any
// square which would reveal terrain, a trap, an object, a monster, or stale
// map memory stops before findone() performs the first mutation.
function preflightEmptyFindone(x, y, state) {
    const location = state.level.at(x, y);
    let monster = m_at(x, y, state);
    if (monster && (monster.mhp < 1 || (monster.isgd && !monster.mx)))
        monster = null;

    const trap = t_at(x, y, state);
    const doorMask = location.flags || location.doormask || 0;
    const floorObjects = state.level.objects?.[x]?.[y] ?? null;
    const trappedObject = trappedBoxInChain(floorObjects, 'nexthere')
        || trappedBuriedBoxAt(x, y, state)
        || (monster && trappedBoxInChain(monster.minvent, 'nobj'))
        || (x === state.u.ux && y === state.u.uy
            && trappedBoxInChain(state.invent, 'nobj'));
    const spottedMonster = monster && canSpotMonster(monster, state);
    const appearance = M_AP_TYPE(monster);
    const examineMonster = monster
        && (!spottedMonster || monster.mundetected || appearance);
    const invisibleRemembered = glyph_is_invisible(
        location.remembered_glyph?.glyph,
    );
    const hiddenMonster = examineMonster
        && (appearance
            || (monster.mundetected
                && (is_hider(monster.data) || hides_under(monster.data)
                    || monster.data?.mlet === S_EEL))
            || (!invisibleRemembered && !spottedMonster));
    const staleInvisible = !examineMonster && invisibleRemembered;

    if (location.typ === SDOOR || location.typ === SCORR
        || (trap && !trap.tseen && trap.ttyp !== STATUE_TRAP)
        || (closedDoor(location) && (doorMask & D_TRAPPED))
        || trappedObject || hiddenMonster || staleInvisible) {
        throw new UnsupportedSearchError(
            'findone() discovery is not ported',
        );
    }
}

function closedDoor(location) {
    const mask = location.flags || location.doormask || 0;
    return location.typ === DOOR && Boolean(mask & (D_LOCKED | D_CLOSED));
}

// C ref: detect.c findit(), restricted to the result where findone() finds no
// secret terrain, trap, trapped container, hidden monster, or stale invisible
// marker anywhere in the BOLT_LIM scan.
export async function findit(state = game, rawEnv = {}) {
    if (state.u.uswallow) return 0;
    if (Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)) {
        // vision.c do_clear_area() overrides normal visibility for magical
        // detection on these two levels; the shared JS traversal does not.
        throw new UnsupportedSearchError(
            'findit() detection through air or water is not ported',
        );
    }
    const clearArea = rawEnv.clearArea ?? do_clear_area;
    clearArea(
        state.u.ux,
        state.u.uy,
        BOLT_LIM,
        (x, y) => preflightEmptyFindone(x, y, state),
        null,
        state,
    );
    const message = rawEnv.message
        ?? ((text) => ttyPline(text, state));
    await message("You don't find anything.");
    return 0;
}

function indefinite(name) {
    return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
}

async function findTrap(trap, env) {
    // displayFoundTrap mutates the live display and reports semantic identity:
    // true means the remembered top layer is this trap, not merely that its
    // projected character and color resemble the trap. False (or
    // hallucination) owns reveal -> message -> acknowledgement -> redraw;
    // WIN_STOP may suppress the acknowledgement while retaining the redraw.
    trap.tseen = true;
    await env.exerciseWisdom(env);
    const trapVisible = await env.displayFoundTrap(
        trap,
        trap.tx,
        trap.ty,
        env,
    );
    if (typeof trapVisible !== 'boolean') {
        throw new TypeError(
            'automatic search displayFoundTrap must return a Boolean',
        );
    }
    const cleared = hallucinating(env.state) || trapVisible === false;
    if (cleared) {
        requireOperation(env, 'revealFoundTrap', 'a cluttered trap');
        requireOperation(env, 'waitFoundTrap', 'a cluttered trap');
        await env.revealFoundTrap(trap, env);
    }
    const name = env.trapName(trap, env);
    await env.message(
        `You find ${indefinite(name)}.`,
        trap.tx,
        trap.ty,
        env,
    );
    if (cleared) await env.waitFoundTrap(env);
}

/**
 * C ref: detect.c dosearch0().
 *
 * aflag == 1 is intrinsic automatic searching, driven by moveloop_core().
 * aflag == 0 is the explicit `s` command, which additionally feels every
 * adjacent square, searches out adjacent monsters through mfind0(), and
 * reconciles a remembered invisible monster through unmap_invisible().
 *
 * The explicit command can be retried, so preflightExplicitSearch() decides
 * its remaining swallowed and trap refusals over all eight squares before the
 * first draw.  The source mfind0() arms are complete and therefore run from
 * the loop for both mimics and unspotted or hidden monsters.
 */
export async function dosearch0(aflag, rawEnv = {}) {
    const explicit = aflag === 0 || aflag === false;
    if (!explicit && aflag !== 1 && aflag !== true) {
        throw new RangeError(
            'dosearch0 takes the automatic (1) or explicit (0) search flag',
        );
    }

    const env = normalizeSearchEnv(rawEnv);
    const { state } = env;
    const { u } = state;
    if (!u || !state.level?.at) {
        throw new Error('searching requires an initialized hero and level');
    }
    if (explicit) preflightExplicitSearch(env);
    // detect.c prints "What are you looking for?  The exit?" through Norep()
    // for an explicit search; the preflight above has already refused that.
    if (u.uswallow) return 1;
    if (typeof env.random.rnl !== 'function') {
        throw new TypeError('searching requires random.rnl');
    }

    const fund = searchFund(state);

    // Preserve detect.c's x-major, then y-minor traversal and its continue
    // boundaries.
    for (let x = u.ux - 1; x < u.ux + 2; ++x) {
        for (let y = u.uy - 1; y < u.uy + 2; ++y) {
            if (!isok(x, y) || (x === u.ux && y === u.uy)) continue;
            const location = state.level.at(x, y);
            // detect.c:2038-2039 calls feel_location() before dispatching the
            // square's terrain branch whenever Blind or a visible region
            // covers it. Keep this ahead of SDOOR/SCORR and trap handling;
            // the canonical display owner performs all tactile memory work.
            if (explicit && (propertyActiveUnblocked(u, BLINDED)
                || visible_region_at(x, y, state))) {
                await env.feelLocation(x, y, env);
            }
            if (location.typ === SDOOR) {
                if (env.random.rnl(7 - fund)) continue;
                preflightSecretDoor(env);
                cvt_sdoor_to_door(location, state);
                env.recalcBlockPoint(x, y, env);
                await env.exerciseWisdom(env);
                env.nomulZero(env);
                await env.feelLocation(x, y, env);
                await env.message(
                    'You find a hidden door.', x, y, env,
                );
            } else if (location.typ === SCORR) {
                if (env.random.rnl(7 - fund)) continue;
                preflightSecretCorridor(env);
                location.typ = CORR;
                env.unblockPoint(x, y, env);
                await env.exerciseWisdom(env);
                env.nomulZero(env);
                await env.feelNewSym(x, y, env);
                await env.message(
                    'You find a hidden passage.', x, y, env,
                );
            } else {
                // "Be careful not to find anything in an SCORR or SDOOR."
                const monster = explicit ? m_at(x, y, state) : null;
                if (monster) {
                    const found = await mfind0(monster, 0, env);
                    if (found === -1) continue;
                    if (found > 0) return found;
                }
                // See if an invisible monster has moved. When Blind,
                // feel_location() has already handled the tactile display.
                if (explicit && !monster
                    && !propertyActiveUnblocked(u, BLINDED)) {
                    unmap_invisible(x, y, state);
                }
                const trap = t_at(x, y, state);
                if (!trap || trap.tseen || env.random.rnl(8)) continue;
                preflightTrap(env, trap);
                env.nomulZero(env);
                if (trap.ttyp === STATUE_TRAP) {
                    const animated = await env.activateStatueTrap(
                        trap, x, y, false, env,
                    );
                    if (animated) await env.exerciseWisdom(env);
                    return 1;
                }
                await findTrap(trap, env);
            }
        }
    }
    return 1;
}

export async function automatic_search(rawEnv = {}) {
    return dosearch0(1, rawEnv);
}

/**
 * C ref: detect.c dosearch(), the handler behind the `s` key and `#search`.
 *
 * already_found_flag is C's ga.already_found_flag, the repeat counter
 * cmd_safety_prevention() keeps for this command alone; it lives beside
 * did_nothing_flag on the game state, which is what donull() passes for its
 * own counter.
 */
export async function dosearch(state = game, rawEnv = {}) {
    const prevented = await cmdSafetyPrevention(
        'Searching',
        'another search',
        'You already found a monster.',
        'already_found_flag',
        state,
    );
    if (prevented) return ECMD_OK;
    return await dosearch0(0, { state, ...rawEnv }) ? ECMD_TIME : ECMD_OK;
}
