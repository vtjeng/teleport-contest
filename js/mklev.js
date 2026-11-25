// mklev.js — Level generation.
// C ref: mklev.c — makelevel, makerooms, makecorridors, generate_stairs.
// Also includes parts of mkmap.c (litstate_rnd); sp_lev.c is in sp_lev.js.
// Stripped-down version for contest: generates regular dungeon levels with
// room placement, corridors, doors, stairs, niches, and fill.
// Uses the real game PRNG (not a separate layout PRNG) for bit-exact parity.

import { game } from './gstate.js';
import { panic } from './end.js';
import { isok } from './cmd_isok.js';
import { GameMap } from './game.js';
import {
    Can_fall_thru,
    In_hell,
    Invocation_lev,
    Is_special,
    at_dgn_entrance,
    depth,
    dungeon_branch,
    dunlev,
    dunlevs_in_dungeon,
    find_level,
    free_exclusions,
    init_dungeons,
    init_mapseen,
    insert_branch,
    level_difficulty,
    level_difficulty_steps,
    on_level,
    ROOM_INDEX,
} from './dungeon.js';
import {
    antholemon_steps,
    do_mkroom,
    has_dnstairs,
    has_upstairs,
} from './mkroom.js';
import { mkcorpstat } from './corpstat.js';
import {
    del_engr_at,
    make_engr_at,
    wipe_engr_at,
} from './engrave.js';
import {
    back_to_glyph_steps,
    flush_screen,
    map_background,
    map_object,
    map_trap,
    installLevel,
    newsym,
    set_wall_state,
} from './display.js';
import { glyph_to_cmap } from './glyphs.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { add_to_container, obj_extract_self, obfree, sobj_at } from './invent.js';
import {
    makemon,
    makemon_by_context,
    dmonsfree,
    set_mimic_sym,
} from './makemon_create.js';
import { mkclass, mkclass_steps } from './makemon.js';
import { mineralize } from './mineralize.js';
import {
    add_doors_to_room,
    build_room,
    check_room,
    create_des_coder,
    create_room,
    create_room_door,
    createSpecialLevelApi,
    dig_corridor,
    ensureSpecialLevelLoaders,
    fill_special_room,
    load_special,
    lspo_exclusion,
    lspo_map,
    lspo_monster,
    reset_xystart_size,
    roomIsFillable,
    sp_lev_frame,
    SPECIAL_LEVEL_LOADERS,
    wallify_map,
} from './sp_lev.js';
import {
    get_table_str,
    get_table_str_opt,
    luaO_chunkid,
    nhlL_newstate,
    nhl_done,
} from './nhlua.js';
import {
    create_maze,
    mazexy,
    populate_maze,
    check_ransacked,
    bound_digging,
    is_solid,
    iswall,
    iswall_or_stone,
    mkportal,
    okay,
} from './mkmaze.js';
import { coreRandom, rn2, rnd, rn1 } from './rng.js';
import {
    init_rect,
    rnd_rect,
    within_bounded_area,
} from './rect.js';
import {
    mkaltar,
    mkfount,
    mkgrave,
    mksink,
} from './room_features.js';
import { in_rooms } from './rooms.js';
import { oinit } from './o_init.js';
import {
    objectGenerationEnv,
} from './object_generation.js';
import { readobjnam } from './objnam_readobjnam.js';
import {
    SPBOOK_NO_NOVEL,
    dealloc_obj,
    mkgold,
    mkobj,
    mkobj_at,
    mksobj,
    mksobj_at,
    weight,
} from './mkobj.js';
import {
    ARMOR_CLASS,
    BOULDER,
    CHEST,
    CORPSE,
    CRAM_RATION,
    FOOD_CLASS,
    FOOD_RATION,
    GEM_CLASS,
    LARGE_BOX,
    LEMBAS_WAFER,
    POTION_CLASS,
    POT_EXTRA_HEALING,
    POT_GAIN_ENERGY,
    POT_HEALING,
    POT_SPEED,
    RANDOM_CLASS,
    RING_CLASS,
    SCROLL_CLASS,
    SCR_CONFUSE_MONSTER,
    SCR_ENCHANT_ARMOR,
    SCR_ENCHANT_WEAPON,
    SCR_SCARE_MONSTER,
    SCR_TELEPORTATION,
    SPE_HEALING,
    STATUE,
    WAN_DIGGING,
    WEAPON_CLASS,
} from './objects.js';
import { deltrap, maketrap, maketrap_async, reset_utrap, t_at } from './trap.js';
import { does_block, unblock_point } from './vision.js';
import { buried_ball_to_punishment } from './dig.js';
import { mintrap } from './trap_effects.js';
import { minliquid, seemimic_async } from './mon.js';
import { m_at } from './monst.js';
import { is_pool } from './dbridge.js';
import { nh_delay_output } from './hack.js';
import {
    displayPendingTtyMessageWindow,
    emitQueuedNotices,
    noticesQueued,
    printQueued,
    ttyPline,
} from './tty_message.js';
import {
    mktrap as make_level_trap,
    occupied,
    traptype_rnd,
} from './mktrap.js';
import { random_engraving } from './random_engraving.js';
import {
    get_free_room_loc,
    get_location,
    get_location_coord,
    get_room_loc,
    inside_room,
    is_ok_location,
    somex,
    somey,
    somexy,
} from './room_coordinates.js';
import { set_levltyp } from './terrain.js';
import {
    lspo_object,
    new_sp_lev_object_context,
} from './sp_lev_object.js';
import {
    initialize_themeroom_postprocess_branch,
    run_themeroom_postprocess,
    themeroom_fill,
} from './themeroom_fill.js';
import {
    G_IGNORE,
    G_NOGEN,
    PM_COCKATRICE,
    PM_GIANT_SPIDER,
    PM_KILLER_BEE,
    PM_LEPRECHAUN,
    PM_SOLDIER,
    PM_GIANT_ZOMBIE,
    PM_ETTIN_ZOMBIE,
    PM_VAMPIRE_LEADER,
    PM_SMALL_MIMIC,
    PM_LARGE_MIMIC,
    PM_GIANT_MIMIC,
    S_HUMAN,
    S_MIMIC,
    S_LICH,
    S_MUMMY,
    S_VAMPIRE,
    S_ZOMBIE,
} from './monsters.js';
import { stairway_add } from './stairs.js';
import { stairway_find_dir } from './stairs.js';
import { THEMEROOM_DEFINITIONS } from './themeroom_data.js';
import {
    COLNO,
    ROWNO,
    STONE,
    ROOM,
    CORR,
    DOOR,
    STAIRS,
    NO_TRAP_FLAGS,
    TT_BURIEDBALL,
    COULD_SEE,
    IN_SIGHT,
    LA_UP,
    LA_DOWN,
    HWALL,
    VWALL,
    TLCORNER,
    TRCORNER,
    BLCORNER,
    BRCORNER,
    CROSSWALL,
    TUWALL,
    TDWALL,
    TLWALL,
    TRWALL,
    D_NODOOR,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_TRAPPED,
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
    MAX_SUBROOMS,
    SHARED,
    SDOOR,
    SCORR,
    IRONBARS,
    FOUNTAIN,
    SINK,
    THRONE,
    TREE,
    DUST,
    DIR_N,
    DIR_S,
    DIR_E,
    DIR_W,
    DIR_180,
    IS_WALL,
    IS_STWALL,
    IS_DOOR,
    IS_ROOM,
    IS_OBSTRUCTED,
    IS_FURNITURE,
    IS_POOL,
    SPACE_POS,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    FILL_NONE,
    FILL_NORMAL,
    G_GONE,
    ICE,
    MOAT,
    POOL,
    WATER,
    LAVAPOOL,
    LAVAWALL,
    ICED_POOL,
    ICED_MOAT,
    DBWALL,
    AIR,
    CLOUD,
    MAX_TYPE,
    MATCH_WALL,
    A_LAWFUL,
    A_NEUTRAL,
    A_CHAOTIC,
    MALE,
    NO_TRAP,
    ROCKTRAP,
    FIRE_TRAP,
    TRAPDOOR,
    TELEP_TRAP,
    LEVEL_TELEP,
    WEB,
    VIBRATING_SQUARE,
    MKTRAP_NOFLAGS,
    BR_PORTAL,
    BR_NO_END1,
    BR_NO_END2,
    SVALL,
    CORPSTAT_INIT,
    MARK,
    MM_NOGRP,
    NO_MM_FLAGS,
    In_quest,
    NO_ROOM,
    Is_rogue_level,
    is_hole,
    INVALID_TYPE,
} from './const.js';
import {
    distmin,
} from './hacklib.js';
import { makeroguerooms, makerogueghost } from './extralev.js';
import { impossible, impossible_printer } from './pline.js';
import { ImpossibleCall, finish_steps } from './source_steps.js';
import { dungeon_at } from './dungeon_table.js';
import { sync_impossible } from './source_steps.js';

// Direction deltas
const xdir = [-1, -1, 0, 1, 1, 1, 0, -1];
const ydir = [0, -1, -1, -1, 0, 1, 1, 1];

// C ref: mklev.c trap_engravings[]. Indices without a source string are
// intentionally absent.
const TRAP_ENGRAVINGS = new Map([
    [TRAPDOOR, 'Vlad was here'],
    [TELEP_TRAP, 'ad aerarium'],
    [LEVEL_TELEP, 'ad aerarium'],
]);

export function levelObjectEnv(overrides = {}) {
    return objectGenerationEnv({ state: game, ...overrides });
}

// C ref: dat/nhlib.lua shuffle(). Lua's one-based math.random(i) becomes the
// injected zero-based rn2(i) index used at each source call site below.
export function shuffle_core_values(values, random) {
    for (let i = values.length; i > 1; --i) {
        const j = random(i);
        [values[i - 1], values[j]] = [values[j], values[i - 1]];
    }
}

// ============================================================
// Core mklev functions (ported from main project's mklev.js)
// ============================================================

// C ref: bones.c getbones() (630-756). Checks whether a bones file exists
// for the current level and, if found, loads it. In wizard mode, prompts
// before loading ("Get bones?") and before deleting ("Unlink bones?").
// Copies: bones.c getbones() is also ported as bones.js getbones() (mklev.js
// holds the checks and prompts, bones.js the restore). A change to it must
// reach every copy.
async function getbones() {
    const state = game;
    if (state.discover) return false;
    if (!state.flags.bones) return false;
    // C: rn2(3) -- only once in three times do we find bones
    if (rn2(3) && !state.wizard) return false;

    const {
        getbones: loadBones,
        no_bones_level,
    } = await import('./bones.js');
    const { delete_bonesfile, open_bonesfile } = await import('./files_bones.js');

    if (no_bones_level(state.u.uz, state)) return false;

    const { yn_function } = await import('./cmd.js');

    // Check if bones exist before any prompts, as C's open_bonesfile().
    if (!open_bonesfile(state.u.uz, state)) return false;

    // Wizard mode: ask whether to load the bones.
    if (state.wizard) {
        const answer = await yn_function(
            'Get bones?', 'yn', 'n', false, state,
        );
        if (answer === 'n') return false;
    }

    // getlev() suppresses map output while it rebuilds the level. The C TTY
    // still has the departing level's map when custompline() prints the
    // following Unlink prompt; the restored level is first painted by the
    // arrival redraw after this prompt. JS's full-screen flush would
    // otherwise rebuild the terminal from the restored level too early.
    if (state.wizard) state._bonesRestorePrompt = true;
    let ok;
    try {
        ok = await loadBones(state);

        // C ref: bones.c:739-744. Wizard mode: ask whether to delete the
        // bones file. If 'n', keep it for next time.
        if (state.wizard) {
            const answer = await yn_function(
                'Unlink bones?', 'yn', 'n', false, state,
            );
            if (answer === 'n') {
                return ok;
            }
        }
    } finally {
        delete state._bonesRestorePrompt;
    }

    return delete_bonesfile(state.u.uz, state) ? ok : false;
}

// C ref: nhlua.c l_nhcore_init()
export function l_nhcore_init(state = game, random = rn2) {
    nhlL_newstate(state);
    const align = [A_LAWFUL, A_NEUTRAL, A_CHAOTIC];
    shuffle_core_values(align, random);
    state.splev_align = align;
    // dat/nhlib.lua's local tutorial_events table, created when nhl_init()
    // loads nhlib.lua into the new core state. Its one entry, the hunger
    // event, is removed after it fires; see nhlua.js tutorial_turn().
    state.tutorial_events = { hunger: true };
}

// C ref: mklev.c mklev()
export async function mklev({ specialLevelLoader = null } = {}) {
    const g = game;
    init_mapseen(g.u.uz, g);
    if (await getbones()) return;
    g.in_mklev = true;
    await makelevel(specialLevelLoader);
    level_finalize_topology();
    g.in_mklev = false;
}

// C ref: mklev.c clear_level_structures()
export function clear_level_structures() {
    const g = game;
    installLevel(new GameMap(), g);
    g.subrooms = [];
    g.nsubroom = 0;
    g.made_branch = false;
    g.stairs = null;
    g.head_engr = null;
    free_exclusions(g);
    // gl.lregions is not cleared here: C empties it only at the end of
    // mkmaze.c fixup_special(), so regions a #wizloadlua level program added
    // stay for the next special-level load (js/gstate.js starts it empty).
    reset_xystart_size(sp_lev_frame(g), g); // mklev.c:922
    g.vault_x = -1;
    const lf = g.level.flags;
    lf.has_shop = false;
    lf.has_vault = false;
    lf.has_zoo = false;
    lf.has_court = false;
    lf.has_morgue = false;
    lf.graveyard = false;
    lf.has_beehive = false;
    lf.has_barracks = false;
    lf.has_temple = false;
    lf.has_swamp = false;
    lf.noteleport = false;
    lf.hardfloor = false;
    lf.nommap = false;
    lf.shortsighted = false;
    lf.sokoban_rules = false;
    lf.is_cavernous_lev = false;
    lf.arboreal = false;
    lf.has_town = false;
    lf.wizard_bones = false;
    lf.corrmaze = false;
    lf.temperature = In_hell(g.u.uz, g) ? 1 : 0;
    lf.rndmongen = true;
    lf.deathdrops = true;
    lf.noautosearch = false;
    lf.fumaroles = false;
    lf.stormy = false;
    lf.stasis_until = 0;
    // C ref: mklev.c clear_level_structures() frees gl.lev_message before
    // evaluating the next special-level description.
    g.gl ??= {};
    g.gl.lev_message = null;
    init_rect();
}

// C ref: mkmap.c litstate_rnd()
export function litstate_rnd(litstate, random = rn2, randomOneBased = rnd) {
    if (litstate < 0) {
        const d = depth(game.u?.uz);
        return (randomOneBased(1 + Math.abs(d)) < 11 && random(77)) ? true : false;
    }
    return !!litstate;
}

// gl.luathemes[dnum], the Lua state holding a dungeon's themed rooms, which
// mklev.c makerooms() loads from svd.dungeons[dnum].themerms and
// themerooms_post_level_generate() reads; state._luathemes_loaded[dnum]
// stands for a non-null one. At dnum -1 (a wished magic portal's destination,
// js/dungeon_table.js) C reads the 8 bytes before gl.luathemes, which in the
// recorder's build are gl.light_base: offsetof(gl, light_base) is 72 and
// offsetof(gl, luathemes) 80 (.cache/lead/wt-dneg1-notes/layout/gl.c). An
// empty light source list reads as no Lua state. A non-empty one would be
// used as a lua_State, which this does not model.
function luathemes_at(dnum, state) {
    if (dnum === -1) {
        if (state.gl?.light_base)
            throw new Error('gl.luathemes[-1] reads gl.light_base as a Lua state');
        return false;
    }
    return Boolean(state._luathemes_loaded?.[dnum]);
}

// C ref: mklev.c free_luathemes() (345-364). `theme_group` is 'tut_themes'
// (leaving the tutorial), 'most_themes' (entering the endgame) or
// 'all_themes'. A freed dungeon's next makerooms() loads its themes again.
export function free_luathemes(theme_group, state = game) {
    for (let i = 0; i < (state.n_dgns ?? 0); ++i) {
        if ((theme_group === 'tut_themes' && i !== state.tutorial_dnum)
            || (theme_group === 'most_themes'
                && i === state.astral_level?.dnum))
            continue;
        if (state._luathemes_loaded?.[i]) {
            nhl_done(null, state);
            state._luathemes_loaded[i] = false;
        }
    }
}

// C refs: nhlua.c nhl_init(); dat/nhlib.lua. Each dungeon branch retains its
// own themed-room Lua state, including nhlib's shuffled alignment array.
export function initialize_themeroom_branch(state = game, random = rn2) {
    const dnum = state.u?.uz?.dnum ?? 0;
    state._luathemes_loaded ??= {};
    state.themeroom_align ??= {};
    if (!state._luathemes_loaded[dnum]) {
        nhlL_newstate(state);
        const align = ['law', 'neutral', 'chaos'];
        shuffle_core_values(align, random);
        state.themeroom_align[dnum] = align;
        state._luathemes_loaded[dnum] = true;
    }
    initialize_themeroom_postprocess_branch(state);
    return state.themeroom_align[dnum];
}

// C ref: mklev.c themerooms_post_level_generate(). Run the retained themed
// Lua callback only from makelevel's common room-fill tail, before the later
// topology pass. A special-level wizard load calls topology directly and must
// not wallify its freshly loaded map a second time.
function themerooms_post_level_generate(state = game) {
    const dnum = state.u?.uz?.dnum ?? 0;
    if (!luathemes_at(dnum, state)) return;
    run_themeroom_postprocess({ state });
    wallification(1, 0, COLNO - 1, ROWNO - 1, state);
    // mklev.c:1191. makerooms() made (or reused) gc.coder for the themes.
    if (state.gc?.coder) state.gc.coder = null;
}

// C ref: mklev.c makelevel()
// C ref: mklev.c makevtele(), inlined here as makeniche(TELEP_TRAP).
async function makelevel(specialLevelLoader = null) {
    const g = game;
    // mklev.c:1414–1418: every generation branch reaches this room-fill
    // tail. load_special itself stops before filling special rooms.
    const fillSpecialRooms = async () => {
        const env = levelObjectEnv();
        for (let i = 0; i < g.level.nroom; ++i) {
            await printQueued(fill_special_room(g.level.rooms[i], env));
        }
    };
    const finishLevelGeneration = async () => {
        await fillSpecialRooms();
        // mklev.c:1414-1420 fills every special room before the themed hook.
        themerooms_post_level_generate(g);
    };
    // C tests wiz1_level.dlevel == 0; before init_dungeons() the JS
    // state has no wiz1_level at all.
    if (!g.wiz1_level?.dlevel) {
        await impossible('makelevel() called when dungeon not yet initialized.', g);
        init_dungeons(g);
    }
    oinit();
    clear_level_structures();

    // C ref: mklev.c:1267-1270. A special level dispatches through
    // makemaz(). This takes priority over both the explicit
    // specialLevelLoader (tests) and the regular room path.
    if (!specialLevelLoader) {
        const slev = Is_special(g.u.uz, g);
        if (slev && slev.proto && !Is_rogue_level(g.u.uz, g)) {
            await makemaz(slev.proto, slev, g);
            await finishLevelGeneration();
            return;
        }
    }

    if (specialLevelLoader) {
        // C refs: nhlua.c nhl_init(); dat/nhlib.lua. Loading an isolated
        // special-level Lua state shuffles its private alignment table before
        // evaluating the level file. Do not mark the persistent themed-room
        // branch as loaded: that Lua state has a different lifetime.
        const nud = nhlL_newstate(g);
        const align = ['law', 'neutral', 'chaos'];
        shuffle_core_values(align, rn2);
        g.specialLevelAlign = align;
        create_des_coder(g);
        const specialLevelApi = createSpecialLevelApi(g, { align, nud });
        await specialLevelLoader(specialLevelApi, g);
        await specialLevelApi.finish();
        await finishLevelGeneration();
        return;
    }

    // C ref: mklev.c:1271-1274. Dungeon-wide prototype or fill level.
    const dungeonRecord = dungeon_at(g.u.uz.dnum, g);
    if (dungeonRecord.proto) {
        await makemaz('', null, g);
        await finishLevelGeneration();
        return;
    }
    if (dungeonRecord.fill_lvl) {
        await makemaz(dungeonRecord.fill_lvl, null, g);
        await finishLevelGeneration();
        return;
    }

    // C ref: mklev.c:1275-1285. Quest filler levels (those not named
    // in the dungeon definition) are generated via makemaz() with a
    // role-specific proto: Bar-fila (above the locate level) or
    // Bar-filb (at or below it).
    if (In_quest(g.u.uz, g)) {
        const filecode = g.urole?.filecode;
        const locaName = `${filecode}-loca`;
        const loc_lev = find_level(locaName, g);
        const fillName = `${filecode}-fil`
            + (g.u.uz.dlevel < loc_lev.dlevel.dlevel ? 'a' : 'b');
        await makemaz(fillName, null, g);
        await finishLevelGeneration();
        return;
    }

    // C ref: mklev.c:1295 — check for below-Medusa maze level
    // This rn2(5) is consumed even when the condition fails (short-circuit)
    const medusa = g.medusa_level;
    if (rn2(5) && g.u?.uz?.dnum === medusa?.dnum
        && (g.u?.uz?.dlevel ?? 1) > (medusa?.dlevel ?? 999)) {
        await makemaz('', null, g);
        await finishLevelGeneration();
        return;
    }

    // Regular level generation
    // C ref: mklev.c:382-388 — load themerms.lua for themed rooms
    // nhlib.lua shuffle when loading themerms.lua (first level of branch)
    // makerooms() loads the dungeon's themerms file into gl.luathemes the
    // first time; only the Dungeons of Doom names one.
    const rogue = Is_rogue_level(g.u.uz, g);
    if (!rogue && (luathemes_at(g.u.uz.dnum, g)
                   || dungeon_at(g.u.uz.dnum, g).themerms))
        initialize_themeroom_branch(g, rn2);

    if (rogue) {
        await printQueued(makeroguerooms(g));
        await printQueued(makerogueghost(g));
    } else {
        await makerooms();
    }

    if (g.level.nroom <= 0) return;
    sort_rooms();
    await generate_stairs();

    // Branch check
    const branchp = is_branchlev();
    // C ref: mklev.c:1306. A level that carries a dungeon branch needs one
    // more room before it can spare one for a special room.
    let room_threshold = branchp ? 4 : 3;

    if (!rogue) {
        await finish_steps(makecorridors_steps(), impossible_printer(g));
        await make_niches();
        await mklev_sanity_check(g);
    }

    // C ref: mklev.c makelevel() secret-vault realization and retry. Rogue
    // levels jump over this block together with corridors and niches.
    if (!rogue && g.vault_x !== -1) {
        const vw = { v: 1 }, vh = { v: 1 };
        const vx = { v: g.vault_x }, vy = { v: g.vault_y };
        let realized = check_room(vx, vw, vy, vh, true);
        if (!realized && rnd_rect() && create_vault()) {
            const staged = g.level.rooms[g.level.nroom];
            g.vault_x = vx.v = staged.lx;
            g.vault_y = vy.v = staged.ly;
            realized = check_room(vx, vw, vy, vh, true);
            if (!realized) staged.hx = -1;
        }
        if (realized) {
            add_room(vx.v, vy.v, vx.v + vw.v, vy.v + vh.v, true, VAULT, false);
            g.level.flags.has_vault = true;
            ++room_threshold;
            const vaultRoom = g.level.rooms[g.level.nroom - 1];
            if (vaultRoom) {
                vaultRoom.needfill = FILL_NORMAL;
                await printQueued(fill_special_room(vaultRoom));
            }
            await mk_knox_portal(vx.v + vw.v, vy.v + vh.v);
            if (!g.level.flags.noteleport && !rn2(3))
                await makeniche(TELEP_TRAP);
        }
    }

    // C ref: mklev.c makelevel() (1344-1375). At most one special room per
    // level, chosen by depth. Shops and the first depth-gated family, COURT,
    // are selected here; later families retain their source-labelled
    // selection branches.
    // `room_threshold` counts the rooms a level must have before it can spare
    // one: four when the level carries a dungeon branch, three otherwise, plus
    // one more when a vault was placed above.
    const u_depth = depth(g.u.uz);
    if (!rogue) {
        // C's first branch is selected by wizard mode plus the presence of
        // the SHOPTYPE environment variable. `state.environment` is the
        // runtime seam for that process environment; an empty value still
        // counts as present, just as nh_getenv()'s non-null pointer does.
        const configuredShopType = g.environment?.SHOPTYPE ?? g.SHOPTYPE;
        const hasConfiguredShopType = configuredShopType !== undefined
            && configuredShopType !== null;
        if (g.wizard && hasConfiguredShopType) {
            await printQueued(do_mkroom(SHOPBASE, g));
        } else if (u_depth > 1 && u_depth < depth(g.medusa_level)
            && g.level.nroom >= room_threshold && rn2(u_depth) < 3) {
            await printQueued(do_mkroom(SHOPBASE, g));
        } else if (u_depth > 4 && !rn2(6)) {
            await printQueued(do_mkroom(COURT, g));
        } else if (u_depth > 5 && !rn2(8)
                   && !(g.mvitals[PM_LEPRECHAUN].mvflags & G_GONE)) {
            await printQueued(do_mkroom(LEPREHALL, g));
        } else if (u_depth > 6 && !rn2(7)) {
            await printQueued(do_mkroom(ZOO, g));
        } else if (u_depth > 8 && !rn2(5)) {
            await printQueued(do_mkroom(TEMPLE, g));
        } else if (u_depth > 9 && !rn2(5)
                   && !(g.mvitals[PM_KILLER_BEE].mvflags & G_GONE)) {
            await printQueued(do_mkroom(BEEHIVE, g));
        } else if (u_depth > 11 && !rn2(6)) {
            await printQueued(do_mkroom(MORGUE, g));
        } else if (u_depth > 12 && !rn2(8)
                   && await finish_steps(antholemon_steps(g),
                       impossible_printer(g))) {
            // C's antholemon() picks the ant species that fills the hole and
            // answers NON_PM when every candidate is gone.
            await printQueued(do_mkroom(ANTHOLE, g));
        } else if (u_depth > 14 && !rn2(4)
                   && !(g.mvitals[PM_SOLDIER].mvflags & G_GONE)) {
            await printQueued(do_mkroom(BARRACKS, g));
        } else if (u_depth > 15 && !rn2(6)) {
            await printQueued(do_mkroom(SWAMP, g));
        } else if (u_depth > 16 && !rn2(8)
                   && !(g.mvitals[PM_COCKATRICE].mvflags & G_GONE)) {
            await printQueued(do_mkroom(COCKNEST, g));
        }
    }

    const previousStairs = g.stairs;

    // Place dungeon branch
    if (branchp) {
        await place_branch(branchp);
    }
    if (g.u.uz.dnum === 0 && g.u.uz.dlevel === 1
        && g.stairs !== previousStairs) {
        g.stairs.u_traversed = true;
    }

    let fillableRoomCount = 0;
    for (let index = 0; index < g.level.nroom; ++index) {
        if (roomIsFillable(g.level.rooms[index])) ++fillableRoomCount;
    }
    let bonusItemRoomCountdown = fillableRoomCount
        ? rn2(fillableRoomCount)
        : -1;
    for (let index = 0; index < g.level.nroom; ++index) {
        const room = g.level.rooms[index];
        const fillable = roomIsFillable(room);
        await printQueued(fill_ordinary_room(
            room,
            fillable && bonusItemRoomCountdown === 0,
        ));
        if (fillable) --bonusItemRoomCountdown;
    }

    await finishLevelGeneration();
}


// C ref: mklev.c mk_knox_portal(), which makelevel() calls once a vault has
// been placed. Fort Ludios is reached through a magic portal rather than a
// staircase, and the branch is deferred from level to level until one deep
// enough accepts it.
//
// C calls insert_branch() before place_branch() so Fort Ludios becomes a
// reachable portal from the accepted vault level. The source endpoint starts
// as the sentinel dungeon number and remains deferred until this branch runs.
async function mk_knox_portal(x, y) {
    const g = game;
    const br = dungeon_branch('Fort Ludios', g);
    const sourceIsEnd2 = on_level(g.knox_level, br.end1);
    if (!sourceIsEnd2) {
        /* disallow Knox branch on a level with one branch already */
        if (is_branchlev()) return;
    }
    const source = sourceIsEnd2 ? br.end2 : br.end1;

    /* Already set or 2/3 chance of deferring until a later level. */
    if (source.dnum < g.n_dgns || (rn2(3) && !g.wizard)) return;

    const u_depth = depth(g.u.uz);
    if (!(g.u.uz.dnum === g.oracle_level.dnum /* in main dungeon */
          && !at_dgn_entrance('The Quest', g) /* but not Quest's entry */
          && u_depth > 10                     /* beneath 10 */
          && u_depth < depth(g.medusa_level))) /* above Medusa */
        return;

    // C ref: mklev.c:2654-2659. Replace the bogus source endpoint, restore
    // branch ordering, and place the portal at the vault's selected corner.
    Object.assign(source, g.u.uz);
    insert_branch(br, true, g);
    await place_branch(br, x, y);
}

// C ref: mklev.c makerooms()
// C ref: nhlua.c nhl_level_difficulty(), a Lua binding. The port runs the Lua
// program from dat/ as JavaScript, which calls the wrapped C function directly
// (nh.level_difficulty() in themerms.lua).
async function makerooms() {
    const g = game;
    let tried_vault = false;
    const themes = luathemes_at(g.u.uz.dnum, g);
    const difficulty = themes ? level_difficulty(g) : 0;
    let themeroom_tries = 0;

    while (g.level.nroom < (MAXNROFROOMS - 1) && rnd_rect()) {
        if (g.level.nroom >= Math.trunc(MAXNROFROOMS / 6) && rn2(2) && !tried_vault) {
            tried_vault = true;
            if (create_vault()) {
                g.vault_x = g.level.rooms[g.level.nroom]?.lx ?? -1;
                g.vault_y = g.level.rooms[g.level.nroom]?.ly ?? -1;
                if (g.level.rooms[g.level.nroom]) g.level.rooms[g.level.nroom].hx = -1;
            }
        } else if (!themes) {
            if (!create_room(-1, -1, -1, -1, -1, -1, OROOM, -1)) break;
        } else {
            // Themed room selection (reservoir sampling)
            g.in_mk_themerooms = true;
            g.themeroom_failed = false;
            let generated;
            try {
                generated = await themerooms_generate(difficulty);
            } finally {
                g.in_mk_themerooms = false;
            }
            if (!generated) {
                if (themeroom_tries++ > 10
                    || g.level.nroom >= Math.trunc(MAXNROFROOMS / 6))
                    break;
            }
        }
    }
}

function is_themeroom_eligible(room, difficulty) {
    if (room.mindiff != null && difficulty < room.mindiff) return false;
    if (room.maxdiff != null && difficulty > room.maxdiff) return false;
    return true;
}

// C ref: themerms.lua themerooms_generate().
// C ref: nhlua.c nhl_rn2(), a Lua binding. The port runs the Lua program from
// dat/ as JavaScript, which calls the wrapped C function directly (nh.rn2() in
// themerms.lua and other programs).
export function select_themeroom(difficulty, random = rn2) {
    let pick = null;
    let total_frequency = 0;
    for (const meta of THEMEROOM_DEFINITIONS) {
        if (!is_themeroom_eligible(meta, difficulty)) continue;
        const this_frequency = meta.frequency;
        total_frequency += this_frequency;
        if (this_frequency > 0 && random(total_frequency) < this_frequency) {
            pick = meta;
        }
    }
    return pick;
}

// C ref: nhlua.c splev_chr2typ()/char2typ[]. The raw port currently uses
// MAX_TYPE for unknown characters where C returns INVALID_TYPE. Legacy
// pattern consumers depend on that conflation; field validation below must
// still distinguish invalid characters from the valid transparent 'x'.
export function splev_chr2typ(char) {
    switch (char) {
    case ' ': return STONE;
    case '#': return CORR;
    case '.': return ROOM;
    case '-': return HWALL;
    case '|': return VWALL;
    case '+': return DOOR;
    case 'A': return AIR;
    case 'C': return CLOUD;
    case 'S': return SDOOR;
    case 'H': return SCORR;
    case '{': return FOUNTAIN;
    case '\\': return THRONE;
    case 'K': return SINK;
    case '}': return MOAT;
    case 'P': return POOL;
    case 'L': return LAVAPOOL;
    case 'Z': return LAVAWALL;
    case 'I': return ICE;
    case 'W': return WATER;
    case 'T': return TREE;
    case 'F': return IRONBARS;
    case 'x': return MAX_TYPE;
    case 'B': return CROSSWALL;
    case 'w': return MATCH_WALL;
    default: return MAX_TYPE;
    }
}

// C ref: nhlua.c check_mapchr(). The terrain type of a one-character map
// string; anything else is INVALID_TYPE. It lives here rather than in
// nhlua.js because it needs splev_chr2typ() and nhlua.js imports nothing.
export function check_mapchr(s) {
    // C strlen() observes only the prefix of a Lua string before its NUL.
    const prefix = typeof s === 'string' ? s.split('\0', 1)[0] : null;
    if (!prefix || prefix.length !== 1) return INVALID_TYPE;
    const typ = splev_chr2typ(prefix);
    // char2typ[] assigns MAX_TYPE only to 'x'; an unknown input is invalid,
    // even while the raw map converter retains its legacy caller semantics.
    return typ === MAX_TYPE && prefix !== 'x' ? INVALID_TYPE : typ;
}

// C ref: nhlua.c get_table_mapchr(). A required map-character field.
export function get_table_mapchr(table, name) {
    const ter = get_table_str(table, name);
    const typ = check_mapchr(ter);
    if (typ === INVALID_TYPE) throw new Error('Erroneous map char');
    return typ;
}

// C ref: nhlua.c get_table_mapchr_opt(). An absent or empty field yields
// `defval`; a string that is not a map character is an error.
export function get_table_mapchr_opt(table, name, defval) {
    const ter = get_table_str_opt(table, name, '');
    if (ter) {
        const typ = check_mapchr(ter);
        if (typ === INVALID_TYPE) throw new Error('Erroneous map char');
        return typ;
    }
    return defval;
}

// C ref: mkmaze.c pick_vibrasquare_location().  The invocation trap is not
// placed with an ordinary random DRY coordinate: its position must leave
// room for mkinvokearea() and stay away from the upstairs.  `inv_pos` is the
// shared C state used by occupied(), so clear it before testing candidates.
export function pick_vibrasquare_location(frame, state) {
    const xMazeMin = 2;
    const yMazeMin = 2;
    const invXMargin = 6 - 2;
    const invYMargin = 5 - 2;
    const invDistance = 11;
    const xRange = frame.xMazeMax - xMazeMin - 2 * invXMargin - 1;
    const yRange = frame.yMazeMax - yMazeMin - 2 * invYMargin - 1;
    const upstairs = stairway_find_dir(true, state);

    state.inv_pos = { x: 0, y: 0 };
    let x = 0;
    let y = 0;
    let tryCount = 0;
    do {
        x = rn1(xRange, xMazeMin + invXMargin + 1);
        y = rn1(yRange, yMazeMin + invYMargin + 1);
        ++tryCount;
    } while (upstairs && tryCount <= 1000 && (
        x === upstairs.sx
        || y === upstairs.sy
        || Math.abs(x - upstairs.sx) === Math.abs(y - upstairs.sy)
        || distmin(x, y, upstairs.sx, upstairs.sy) <= invDistance
        || !SPACE_POS(state.level.at(x, y).typ)
        || occupied(x, y, state)
    ));
    return { x, y };
}

// C ref: mklev.c mkinvokearea(), mkinvpos(), and mkinvk_check_wall(). A
// successful Book of the Dead invocation changes this level's terrain around
// `state.inv_pos`, then places the Sanctum stairs under the hero.
export async function mkinvokearea(state = game, rawEnv = {}) {
    const message = rawEnv.message ?? ttyPline;
    const redraw = rawEnv.newsym ?? newsym;
    const flush = rawEnv.flushScreen ?? flush_screen;
    const delay = rawEnv.delayOutput ?? nh_delay_output;
    let xmin = state.inv_pos.x;
    let xmax = state.inv_pos.x;
    let ymin = state.inv_pos.y;
    let ymax = state.inv_pos.y;

    await message('The floor shakes violently under you!', state, rawEnv);

    // C expands the candidate rectangle in the same order as the later
    // topology loop, stopping the wall search at its first positive ring.
    let wallct = mkinvk_check_wall(xmin, ymin, state);
    for (let dist = 1; !wallct && dist < 7; ++dist) {
        --xmin;
        ++xmax;
        if (dist !== 3) {
            --ymin;
            ++ymax;
            for (let x = xmin + 1; x < xmax; ++x) {
                if (mkinvk_check_wall(x, ymin, state)) ++wallct;
                if (mkinvk_check_wall(x, ymax, state)) ++wallct;
            }
        }
        if (!wallct) {
            for (let y = ymin; y <= ymax; ++y) {
                if (mkinvk_check_wall(xmin, y, state)) ++wallct;
                if (mkinvk_check_wall(xmax, y, state)) ++wallct;
            }
        }
    }
    if (wallct)
        await message('The walls around you begin to bend and crumble!', state, rawEnv);

    await (rawEnv.displayMessageWindow ?? displayPendingTtyMessageWindow)(state);

    if (state.u.utrap) {
        if (state.u.utraptype === TT_BURIEDBALL)
            await buried_ball_to_punishment(state, rawEnv);
        await reset_utrap(false, state);
    }

    xmin = state.inv_pos.x;
    xmax = state.inv_pos.x;
    ymin = state.inv_pos.y;
    ymax = state.inv_pos.y;
    await mkinvpos(xmin, ymin, 0, state, rawEnv);

    for (let dist = 1; dist < 7; ++dist) {
        --xmin;
        ++xmax;
        if (dist !== 3) {
            --ymin;
            ++ymax;
            for (let x = xmin + 1; x < xmax; ++x) {
                await mkinvpos(x, ymin, dist, state, rawEnv);
                await mkinvpos(x, ymax, dist, state, rawEnv);
            }
        }
        for (let y = ymin; y <= ymax; ++y) {
            await mkinvpos(xmin, y, dist, state, rawEnv);
            await mkinvpos(xmax, y, dist, state, rawEnv);
        }
        await flush(1);
        await delay(state);
    }

    await message('You are standing at the top of a stairwell leading down!', state, rawEnv);
    await mkstairs(state.u.ux, state.u.uy, 0, null, false,
        impossible_printer(state));
    await printQueued(redraw(state.u.ux, state.u.uy, state));
    state.vision_full_recalc = 1;
}

async function mkinvpos(x, y, dist, state = game, rawEnv = {}) {
    const xMazeMax = state.x_maze_max ?? ((COLNO - 1) & ~1);
    const yMazeMax = state.y_maze_max ?? ((ROWNO - 1) & ~1);
    // C decl.c initializes these bounds to the greatest even coordinates;
    // retain optional level-specific bounds when a caller supplies them.
    if (!within_bounded_area(x, y, 2, 2, xMazeMax, yMazeMax)) {
        if (dist < 5 && state === game) {
            // mklev.c:2520-2524: panic() off the map, impossible() on it.
            const text = `mkinvpos: <${x},${y}> (${dist}) off map edge!`;
            if (isok(x, y)) await impossible(text, state, rawEnv);
            else await panic(text, state);
        }
        return;
    }

    let trap = t_at(x, y, state);
    if (trap) deltrap(trap, state);

    let makeRocks = dist !== 1 && dist !== 4 && dist !== 5;
    while (true) {
        const boulder = sobj_at(BOULDER, x, y, state);
        if (!boulder) break;
        if (makeRocks) {
            const { fracture_rock } = await import('./zap.js');
            await fracture_rock(boulder, state, rawEnv.random, rawEnv);
            makeRocks = false;
        } else {
            await obj_extract_self(boulder, { ...rawEnv, state });
            obfree(boulder, null, { ...rawEnv, state });
        }
    }

    const location = state.level.at(x, y);
    location.seenv = 0;
    location.flags = 0;
    if (dist < 6) location.lit = true;
    location.waslit = true;
    location.horizontal = false;
    state.viz_array[y][x] = dist < 6
        ? IN_SIGHT | COULD_SEE
        : COULD_SEE;

    switch (dist) {
    case 1:
        if (is_pool(x, y, state)) break;
        location.typ = ROOM;
        trap = await maketrap_async(x, y, FIRE_TRAP, { ...rawEnv, state });
        if (trap) trap.tseen = true;
        break;
    case 0:
    case 2:
    case 3:
    case 6:
        location.typ = ROOM;
        break;
    case 4:
    case 5:
        location.typ = MOAT;
        break;
    default:
        // C's impossible() arm is unreachable from mkinvokearea's fixed
        // 0..6 distance sequence; retain its discarded diagnostic boundary.
        if (state === game) await impossible(
            `mkinvpos called with dist ${dist}`, state, rawEnv);
        break;
    }

    const monster = m_at(x, y, state);
    if (monster) {
        if (monster.m_ap_type) await seemimic_async(monster, state, rawEnv);
        if (t_at(x, y, state))
            await mintrap(monster, NO_TRAP_FLAGS, { ...rawEnv, state });
        else
            await minliquid(monster, { ...rawEnv, state });
    }

    if (!does_block(x, y, location, state)) unblock_point(x, y, state);
    await printQueued((rawEnv.newsym ?? newsym)(x, y, state));
}

// C ref: mklev.c mkinvk_check_wall(). This pure predicate is source-pinned in
// scripts/mkinvokearea.test.mjs.
export function mkinvk_check_wall(x, y, state = game) {
    if (!isok(x, y)) return 0;
    const typ = state.level.at(x, y).typ;
    return IS_STWALL(typ) || typ === IRONBARS ? 1 : 0;
}

// C ref: nhlua.c load_lua() for a level program named by #wizloadlua
// (wizcmds.c wiz_load_lua()). C runs its des.* calls on the current level:
// the first creates gc.coder, nothing post-processes the level, and the coder
// stays for the next special-level load to reuse. `align` is the shuffled
// nhlib.lua table of the Lua state nhl_init() made.
export async function run_level_program(name, file, lua, state) {
    await ensureSpecialLevelLoaders();
    state.specialLevelAlign = lua.align;
    await runLevelLoader(name, file, lua, createSpecialLevelApi(state, lua),
        state);
}

// The level program in the installed `file` that nhl_loadlua() opened for
// `name`, as its lua_pcall() runs the main chunk, called from C (the bottom
// "[C]: in ?" of a traceback). The chunk is named "(<name>)" from the name as
// typed, so "Castle.lua" runs castle.lua as "(Castle.lua)". The chunk keeps
// no line numbers except where a loader records them.
export async function runLevelLoader(name, file, lua, specialLevelApi, state) {
    lua.chunk = luaO_chunkid(`(${name})`);
    lua.frames = [
        { desc: '?' },
        { lua: true, desc: 'main chunk', currentline: 0 },
    ];
    await SPECIAL_LEVEL_LOADERS[file.slice(0, -'.lua'.length)](
        specialLevelApi, state);
}

// C ref: mkmaze.c makemaz(). Selects the special level variant, loads
// and runs the corresponding level definition through the special level
// API, and applies post-processing.
async function makemaz(proto, slev, state) {
    let protofile;
    if (proto) {
        if (slev && slev.rndlevs) {
            protofile = `${proto}-${rnd(slev.rndlevs)}`;
        } else {
            protofile = proto;
        }
    } else {
        protofile = '';
    }

    if (protofile) {
        check_ransacked(protofile, state);
        // C ref: mkmaze.c:1184-1193. load_special() runs the Lua level
        // definition and applies post-processing. C appends LEV_EXT first.
        if (await load_special(`${protofile}.lua`, state)) {
            // C ref: mkmaze.c:1191. Dead monsters created during level
            // loading are freed here.
            dmonsfree(state);
            return;
        }
        await impossible(
            `Couldn't load "${protofile}.lua" - making a maze.`, state);
    }

    // C ref: mkmaze.c:1197-1223. Procedural generation for unnamed mazes.
    const frame = {
        xMazeMax: (COLNO - 1) & ~1,
        yMazeMax: (ROWNO - 1) & ~1,
    };
    state.level.flags.is_maze_lev = true;
    state.level.flags.corrmaze = !rn2(3);
    const invocation = Invocation_lev(state.u.uz, state);
    if (!invocation && rn2(2))
        create_maze(-1, -1, !rn2(5), frame, state);
    else
        create_maze(1, 1, false, frame, state);
    if (!state.level.flags.corrmaze)
        wallification(2, 2, frame.xMazeMax, frame.yMazeMax, state);
    let point = mazexy(null, frame, state);
    await mkstairs(point.x, point.y, true, null, false,
        impossible_printer(state));
    if (!invocation) {
        point = mazexy(null, frame, state);
        await mkstairs(point.x, point.y, false, null, false,
            impossible_printer(state));
    } else {
        state.inv_pos = pick_vibrasquare_location(frame, state);
        await maketrap_async(state.inv_pos.x, state.inv_pos.y, VIBRATING_SQUARE, { state });
    }
    await place_branch(is_branchlev(), 0, 0, frame);
    await populate_maze(frame, state);
}

// =========================================================================
// C ref: mkmap.c — Cellular-automata cave generation (mines-style levels).
// =========================================================================

const HEIGHT = ROWNO - 1;
const WIDTH = COLNO - 2;

const N_P1_ITER = 1;
const N_P2_ITER = 1;
const N_P3_ITER = 2;

const mkmap_dirs = [
    -1, -1, -1, 0, -1, 1, 0, -1,
    0, 1, 1, -1, 1, 0, 1, 1,
];

// C ref: mkmap.c init_map(). Fill every map cell with bg_typ.
function mkmap_init_map(bg_typ, state) {
    for (let x = 1; x < COLNO; x++) {
        for (let y = 0; y < ROWNO; y++) {
            const loc = state.level.at(x, y);
            loc.roomno = NO_ROOM;
            loc.typ = bg_typ;
            loc.lit = false;
        }
    }
}

// C ref: mkmap.c init_fill(). Randomly place fg_typ cells until 40% of
// the interior is filled.
function mkmap_init_fill(bg_typ, fg_typ, state) {
    const limit = Math.trunc((WIDTH * HEIGHT * 2) / 5);
    let count = 0;
    while (count < limit) {
        const x = rn1(WIDTH - 1, 2);
        const y = rnd(HEIGHT - 1);
        if (state.level.at(x, y).typ === bg_typ) {
            state.level.at(x, y).typ = fg_typ;
            count++;
        }
    }
}

// C ref: mkmap.c get_map(). Return the terrain at (col,row), or bg_typ
// if out of bounds.
function mkmap_get_map(col, row, bg_typ, state) {
    if (col <= 0 || row < 0 || col > WIDTH || row >= HEIGHT)
        return bg_typ;
    return state.level.at(col, row).typ;
}

// C ref: mkmap.c pass_one(). Cellular automata: cells with <= 2 fg
// neighbors die; cells with >= 5 fg neighbors are born.
function mkmap_pass_one(bg_typ, fg_typ, state) {
    for (let x = 2; x <= WIDTH; x++) {
        for (let y = 1; y < HEIGHT; y++) {
            let count = 0;
            for (let dr = 0; dr < 8; dr++) {
                if (mkmap_get_map(
                    x + mkmap_dirs[dr * 2],
                    y + mkmap_dirs[dr * 2 + 1],
                    bg_typ, state,
                ) === fg_typ)
                    count++;
            }
            switch (count) {
            case 0: case 1: case 2:
                state.level.at(x, y).typ = bg_typ;
                break;
            case 5: case 6: case 7: case 8:
                state.level.at(x, y).typ = fg_typ;
                break;
            default:
                break;
            }
        }
    }
}

// C ref: mkmap.c pass_two(). Cells with exactly 5 fg neighbors become bg.
function mkmap_pass_two(bg_typ, fg_typ, state) {
    const newLocs = new Array((WIDTH + 1) * HEIGHT);
    for (let x = 2; x <= WIDTH; x++) {
        for (let y = 1; y < HEIGHT; y++) {
            let count = 0;
            for (let dr = 0; dr < 8; dr++) {
                if (mkmap_get_map(
                    x + mkmap_dirs[dr * 2],
                    y + mkmap_dirs[dr * 2 + 1],
                    bg_typ, state,
                ) === fg_typ)
                    count++;
            }
            if (count === 5)
                newLocs[y * (WIDTH + 1) + x] = bg_typ;
            else
                newLocs[y * (WIDTH + 1) + x]
                    = mkmap_get_map(x, y, bg_typ, state);
        }
    }
    for (let x = 2; x <= WIDTH; x++)
        for (let y = 1; y < HEIGHT; y++)
            state.level.at(x, y).typ = newLocs[y * (WIDTH + 1) + x];
}

// C ref: mkmap.c pass_three(). Smoothing: cells with < 3 fg neighbors
// become bg.
function mkmap_pass_three(bg_typ, fg_typ, state) {
    const newLocs = new Array((WIDTH + 1) * HEIGHT);
    for (let x = 2; x <= WIDTH; x++) {
        for (let y = 1; y < HEIGHT; y++) {
            let count = 0;
            for (let dr = 0; dr < 8; dr++) {
                if (mkmap_get_map(
                    x + mkmap_dirs[dr * 2],
                    y + mkmap_dirs[dr * 2 + 1],
                    bg_typ, state,
                ) === fg_typ)
                    count++;
            }
            if (count < 3)
                newLocs[y * (WIDTH + 1) + x] = bg_typ;
            else
                newLocs[y * (WIDTH + 1) + x]
                    = mkmap_get_map(x, y, bg_typ, state);
        }
    }
    for (let x = 2; x <= WIDTH; x++)
        for (let y = 1; y < HEIGHT; y++)
            state.level.at(x, y).typ = newLocs[y * (WIDTH + 1) + x];
}

// C ref: mkmap.c flood_fill_rm(). Flood-fill from (sx,sy) marking all
// contiguous cells of the same terrain type with roomno. Tracks bounding
// box in state._mkmap_min/max. When anyroom is true, IS_ROOM terrain
// matches and adjacent walls receive the roomno as well.
export function flood_fill_rm(sx, sy, rmno, lit, anyroom, state) {
    const fg_typ = state.level.at(sx, sy).typ;

    // Back up to leftmost uninitialized location.
    while (sx > 0
        && (anyroom
            ? IS_ROOM(state.level.at(sx, sy).typ)
            : state.level.at(sx, sy).typ === fg_typ)
        && state.level.at(sx, sy).roomno !== rmno)
        sx--;
    sx++;

    if (sx < state._mkmap_min_rx) state._mkmap_min_rx = sx;
    if (sy < state._mkmap_min_ry) state._mkmap_min_ry = sy;

    let i;
    for (i = sx;
        i <= WIDTH && state.level.at(i, sy).typ === fg_typ;
        i++) {
        state.level.at(i, sy).roomno = rmno;
        state.level.at(i, sy).lit = lit;
        if (anyroom) {
            for (let ii = (i === sx ? i - 1 : i); ii <= i + 1; ii++) {
                for (let jj = sy - 1; jj <= sy + 1; jj++) {
                    if (isok(ii, jj)
                        && (IS_WALL(state.level.at(ii, jj).typ)
                            || IS_DOOR(state.level.at(ii, jj).typ)
                            || state.level.at(ii, jj).typ === SDOOR)) {
                        state.level.at(ii, jj).edge = true;
                        if (lit)
                            state.level.at(ii, jj).lit = lit;
                        if (state.level.at(ii, jj).roomno === NO_ROOM)
                            state.level.at(ii, jj).roomno = rmno;
                        else if (state.level.at(ii, jj).roomno !== rmno)
                            state.level.at(ii, jj).roomno = SHARED;
                    }
                }
            }
        }
        state._mkmap_n_loc_filled++;
    }
    const nx = i;

    if (isok(sx, sy - 1)) {
        for (i = sx; i < nx; i++) {
            if (state.level.at(i, sy - 1).typ === fg_typ) {
                if (state.level.at(i, sy - 1).roomno !== rmno)
                    flood_fill_rm(i, sy - 1, rmno, lit, anyroom, state);
            } else {
                if ((i > sx || isok(i - 1, sy - 1))
                    && state.level.at(i - 1, sy - 1).typ === fg_typ) {
                    if (state.level.at(i - 1, sy - 1).roomno !== rmno)
                        flood_fill_rm(
                            i - 1, sy - 1, rmno, lit, anyroom, state,
                        );
                }
                if ((i < nx - 1 || isok(i + 1, sy - 1))
                    && state.level.at(i + 1, sy - 1).typ === fg_typ) {
                    if (state.level.at(i + 1, sy - 1).roomno !== rmno)
                        flood_fill_rm(
                            i + 1, sy - 1, rmno, lit, anyroom, state,
                        );
                }
            }
        }
    }
    if (isok(sx, sy + 1)) {
        for (i = sx; i < nx; i++) {
            if (state.level.at(i, sy + 1).typ === fg_typ) {
                if (state.level.at(i, sy + 1).roomno !== rmno)
                    flood_fill_rm(i, sy + 1, rmno, lit, anyroom, state);
            } else {
                if ((i > sx || isok(i - 1, sy + 1))
                    && state.level.at(i - 1, sy + 1).typ === fg_typ) {
                    if (state.level.at(i - 1, sy + 1).roomno !== rmno)
                        flood_fill_rm(
                            i - 1, sy + 1, rmno, lit, anyroom, state,
                        );
                }
                if ((i < nx - 1 || isok(i + 1, sy + 1))
                    && state.level.at(i + 1, sy + 1).typ === fg_typ) {
                    if (state.level.at(i + 1, sy + 1).roomno !== rmno)
                        flood_fill_rm(
                            i + 1, sy + 1, rmno, lit, anyroom, state,
                        );
                }
            }
        }
    }

    if (nx > state._mkmap_max_rx) state._mkmap_max_rx = nx - 1;
    if (sy > state._mkmap_max_ry) state._mkmap_max_ry = sy;
}

// C ref: mkmap.c join_map_cleanup(). Clear room assignments after joining.
function mkmap_join_map_cleanup(state) {
    for (let x = 1; x < COLNO; x++)
        for (let y = 0; y < ROWNO; y++)
            state.level.at(x, y).roomno = NO_ROOM;
    state.level.nroom = 0;
    state.nsubroom = 0;
    if (state.level.rooms[0]) state.level.rooms[0].hx = -1;
    if (state.subrooms?.[0]) state.subrooms[0].hx = -1;
}

// C ref: mkmap.c join_map(). Flood-fill to find fg_typ regions, create
// temporary rooms for them, then dig corridors to connect adjacent regions.
// A step generator: it yields the impossible() C prints when a region has no
// square somexy() can pick.
export function* mkmap_join_map_steps(bg_typ, fg_typ, state) {
    // Find all regions via flood fill and create rooms for them. C's
    // `goto joinm` leaves both loops, so the label is on the outer one.
    joinm: for (let x = 2; x <= WIDTH; x++) {
        for (let y = 1; y < HEIGHT; y++) {
            if (state.level.at(x, y).typ === fg_typ
                && state.level.at(x, y).roomno === NO_ROOM) {
                state._mkmap_min_rx = x;
                state._mkmap_max_rx = x;
                state._mkmap_min_ry = y;
                state._mkmap_max_ry = y;
                state._mkmap_n_loc_filled = 0;
                flood_fill_rm(
                    x, y,
                    state.level.nroom + ROOMOFFSET,
                    false, false, state,
                );
                if (state._mkmap_n_loc_filled > 3) {
                    add_room(
                        state._mkmap_min_rx, state._mkmap_min_ry,
                        state._mkmap_max_rx, state._mkmap_max_ry,
                        false, OROOM, true,
                    );
                    state.level.rooms[state.level.nroom - 1].irregular
                        = true;
                    if (state.level.nroom >= MAXNROFROOMS * 2)
                        break joinm;
                } else {
                    // Tiny hole: erase it.
                    for (let sx = state._mkmap_min_rx;
                        sx <= state._mkmap_max_rx; sx++) {
                        for (let sy = state._mkmap_min_ry;
                            sy <= state._mkmap_max_ry; sy++) {
                            if (state.level.at(sx, sy).roomno
                                === state.level.nroom + ROOMOFFSET) {
                                state.level.at(sx, sy).typ = bg_typ;
                                state.level.at(sx, sy).roomno = NO_ROOM;
                            }
                        }
                    }
                }
            }
        }
    }

    // Connect adjacent regions with corridors.
    const rooms = state.level.rooms;
    let ci = 0;
    let ci2 = 1;
    while (ci2 < state.level.nroom) {
        const croom = rooms[ci];
        const croom2 = rooms[ci2];
        const sm = {};
        const em = {};
        if (!somexy(croom, sm, { state }) || !somexy(croom2, em, { state })) {
            /* ack! -- the level is going to be busted */
            /* arbitrarily pick centers of both rooms and hope for the best */
            yield new ImpossibleCall('No start/end room loc in join_map.');
            sm.x = croom.lx + Math.trunc((croom.hx - croom.lx) / 2);
            sm.y = croom.ly + Math.trunc((croom.hy - croom.ly) / 2);
            em.x = croom2.lx + Math.trunc((croom2.hx - croom2.lx) / 2);
            em.y = croom2.ly + Math.trunc((croom2.hy - croom2.ly) / 2);
        }
        dig_corridor(sm, em, null, false, fg_typ, bg_typ);
        if (croom2.lx > croom.hx
            || ((croom2.ly > croom.hy || croom2.hy < croom.ly)
                && rn2(3))) {
            ci = ci2;
        }
        ci2++;
    }
    mkmap_join_map_cleanup(state);
}

// C ref: mkmap.c finish_map(). Apply wallification and lighting.
function mkmap_finish_map(fg_typ, bg_typ, lit, walled, icedpools, state) {
    if (walled)
        wallify_map(1, 0, COLNO - 1, ROWNO - 1, state);

    if (lit) {
        for (let x = 1; x < COLNO; x++) {
            for (let y = 0; y < ROWNO; y++) {
                const loc = state.level.at(x, y);
                if ((!IS_OBSTRUCTED(fg_typ) && loc.typ === fg_typ)
                    || (!IS_OBSTRUCTED(bg_typ) && loc.typ === bg_typ)
                    || (bg_typ === TREE && loc.typ === bg_typ)
                    || (walled && IS_WALL(loc.typ)))
                    loc.lit = true;
            }
        }
        for (let i = 0; i < state.level.nroom; i++)
            state.level.rooms[i].rlit = 1;
    }
    // Light lava; tag ice as frozen pool or moat.
    for (let x = 1; x < COLNO; x++) {
        for (let y = 0; y < ROWNO; y++) {
            const loc = state.level.at(x, y);
            if (loc.typ === LAVAPOOL) loc.lit = true;
            else if (loc.typ === ICE)
                loc.flags = icedpools ? ICED_POOL : ICED_MOAT;
        }
    }
}

// C ref: mkmap.c mkmap(). Top-level cave generator: fill, automata passes,
// optional smoothing and joining, then finish with walls and lighting.
// A step generator, for join_map()'s impossible().
export function* mkmap_steps(init_lev, state) {
    const bg_typ = init_lev.bg;
    const fg_typ = init_lev.fg;
    const smooth = init_lev.smoothed;
    const join = init_lev.joined;
    let lit = init_lev.lit;
    const walled = init_lev.walled;

    lit = litstate_rnd(lit);

    mkmap_init_map(bg_typ, state);
    mkmap_init_fill(bg_typ, fg_typ, state);

    for (let i = 0; i < N_P1_ITER; i++)
        mkmap_pass_one(bg_typ, fg_typ, state);

    for (let i = 0; i < N_P2_ITER; i++)
        mkmap_pass_two(bg_typ, fg_typ, state);

    if (smooth)
        for (let i = 0; i < N_P3_ITER; i++)
            mkmap_pass_three(bg_typ, fg_typ, state);

    if (join)
        yield* mkmap_join_map_steps(bg_typ, fg_typ, state);

    mkmap_finish_map(
        fg_typ, bg_typ, lit, walled,
        init_lev.icedpools ?? false, state,
    );
    // A walled, joined level is cavernous, not mazelike.
    if (walled && join) {
        state.level.flags.is_maze_lev = false;
        state.level.flags.is_cavernous_lev = true;
    }
}

// C ref: mkmaze.c walkfrom() (non-MICRO recursive version). Carves a
// maze by picking a random viable direction, setting the intermediate
// cell, then recursing into the destination. The C code modifies x,y
// in place via mz_move before the recursive call, so after the call
// returns the while loop continues from the DESTINATION, not the
// original cell. This produces a different carving order from a
// standard iterative DFS, so an iterative stack-based version would
// NOT match the C. The Castle level's maze wings are small enough
// (about 8x17 cells) that recursion depth stays well within limits.
// bounds defaults match the full maze area used by special levels.
// create_maze() passes reduced bounds when generating a scaled maze.
function walkfrom(x, y, typ, state, bounds) {
    if (!typ) {
        typ = state.level.flags.corrmaze ? CORR : ROOM;
    }
    if (!IS_DOOR(state.level.at(x, y).typ)) {
        state.level.at(x, y).typ = typ;
        state.level.at(x, y).flags = 0;
    }
    // C ref: mkmaze.c mz_move(). Direction mapping:
    // 0=north(y--), 1=east(x++), 2=south(y++), 3=west(x--).
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    for (;;) {
        let q = 0;
        const dirs = [0, 0, 0, 0];
        for (let a = 0; a < 4; ++a) {
            if (okay(x, y, a, state, bounds)) dirs[q++] = a;
        }
        if (!q) return;
        const dir = dirs[rn2(q)];
        // mz_move step 1: advance to intermediate cell and set it.
        x += dx[dir];
        y += dy[dir];
        // C guards only the starting/destination square. The intervening
        // square is overwritten even if it was a door, without flag resets.
        state.level.at(x, y).typ = typ;
        // mz_move step 2: advance to destination cell.
        x += dx[dir];
        y += dy[dir];
        // Recurse; after it returns, x,y still point to the destination
        // (matching the C behavior where mz_move modifies x,y in place).
        walkfrom(x, y, typ, state, bounds);
    }
}

// C ref: mkmap.c flood_fill_rm(..., anyroom=TRUE), as used by
// sp_lev.c:lspo_region() for an irregular themed-room region.
function flood_fill_themeroom(sx, sy, roomno, lit, state) {
    const target = state.level.at(sx, sy)?.typ;
    if (target !== ROOM) return null;
    const stack = [[sx, sy]];
    let minx = sx, maxx = sx, miny = sy, maxy = sy;
    while (stack.length) {
        const [x, y] = stack.pop();
        const loc = state.level.at(x, y);
        if (!loc || loc.typ !== target || loc.roomno === roomno) continue;
        loc.roomno = roomno;
        loc.lit = !!lit;
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);

        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
        for (let xx = x - 1; xx <= x + 1; xx++) {
            for (let yy = y - 1; yy <= y + 1; yy++) {
                const edge = state.level.at(xx, yy);
                if (!edge || !(IS_WALL(edge.typ) || IS_DOOR(edge.typ) || edge.typ === SDOOR))
                    continue;
                edge.edge = true;
                if (lit) edge.lit = true;
                if (edge.roomno === 0) edge.roomno = roomno;
                else if (edge.roomno !== roomno) edge.roomno = SHARED;
            }
        }
    }
    return { minx, maxx, miny, maxy };
}

export class UnsupportedThemeroomActionError extends Error {
    constructor(definition, detail) {
        super(`themed room ${JSON.stringify(definition?.name ?? definition?.id)} ${detail}`);
        this.name = 'UnsupportedThemeroomActionError';
        this.definitionId = definition?.id ?? null;
    }
}

function preflight_themeroom_fill(definition, context) {
    if (typeof context.themeroomFill !== 'function') {
        throw new UnsupportedThemeroomActionError(
            definition,
            'requires an injected themeroom-fill callback',
        );
    }
    if (!Number.isInteger(context.difficulty)) {
        throw new UnsupportedThemeroomActionError(
            definition,
            'requires an integer difficulty for its themeroom-fill callback',
        );
    }
    return true;
}

function invoke_themeroom_fill(room, definition, context) {
    // Callers validate before creating the room or loading its map.
    // Lua invokes contents before leaving the current room context. Keep this
    // callback. This is the exact themeroom_fill(room, difficulty, rawEnv)
    // contract, including the indexed room that selection.room() needs. A
    // shape-changing monster can make the callback asynchronous; return that
    // result so lspo_room() can keep its source-order door scan.
    return context.themeroomFill(room, context.difficulty, {
        state: game,
        random: context.randomFacade,
    });
}

// C ref: sp_lev.c lspo_region() irregular-room branch.
function register_irregular_map_region(
    seed,
    roomType,
    needfill,
    joined,
    context,
) {
    const state = game;
    const lit = litstate_rnd(
        -1,
        context.random,
        context.randomOneBased,
    );
    const roomIndex = state.level.nroom;
    const bounds = flood_fill_themeroom(
        seed.x,
        seed.y,
        roomIndex + ROOMOFFSET,
        lit,
        state,
    );
    if (!bounds) return null;
    state.smeq[roomIndex] = roomIndex;
    add_room(
        bounds.minx, bounds.miny, bounds.maxx, bounds.maxy,
        false, roomType, true,
    );
    const room = state.level.rooms[roomIndex];
    room.rlit = lit ? 1 : 0;
    room.irregular = true;
    room.needjoining = joined;
    room.needfill = needfill;
    return room;
}

// C refs: themerms.lua filler_region(); sp_lev.c lspo_region().
function filler_region(filler, origin, definition, context) {
    const themed = context.random(100) < 30;
    if (themed) preflight_themeroom_fill(definition, context);
    const room = register_irregular_map_region(
        { x: origin.x + filler.x, y: origin.y + filler.y },
        themed ? THEMEROOM : OROOM,
        FILL_NORMAL,
        true,
        context,
    );
    if (!room) return false;
    if (themed) {
        const maybeFill = invoke_themeroom_fill(room, definition, context);
        if (maybeFill && typeof maybeFill.then === 'function')
            return maybeFill.then(() => true);
    }
    return true;
}

const THEMEROOM_TYPE_MAP = {
    ordinary: OROOM, themed: THEMEROOM,
    shop: SHOPBASE, 'armor shop': ARMORSHOP,
    'scroll shop': SCROLLSHOP, 'potion shop': POTIONSHOP,
    'weapon shop': WEAPONSHOP, 'food shop': FOODSHOP,
    'ring shop': RINGSHOP, 'wand shop': WANDSHOP,
    'tool shop': TOOLSHOP, 'book shop': BOOKSHOP,
    'health food shop': FODDERSHOP,
    'candle shop': CANDLESHOP,
};
function room_type_from_schema(type, definition) {
    const rtype = THEMEROOM_TYPE_MAP[type];
    if (rtype !== undefined) return rtype;
    throw new UnsupportedThemeroomActionError(
        definition,
        `has unsupported room type ${JSON.stringify(type)}`,
    );
}

// C ref: sp_lev.c lspo_room(). Keep the callback boundary in one place so
// nested handlers share room failure propagation, parent irregularity, and
// the post-callback door-table scan. A returned room means that this descriptor
// was created; callers must inspect game.themeroom_failed (C's
// gt.themeroom_failed, which lspo_room() also sets) for aggregate failure
// because a nested descriptor can fail while this room still finalizes.
export function run_room_descriptor(spec, parent, context, contents = null) {
    if (game.themeroom_failed) return null;
    const room = build_room(
        {
            x: spec.x ?? -1,
            y: spec.y ?? -1,
            w: spec.w ?? -1,
            h: spec.h ?? -1,
            xalign: spec.xalign ?? -1,
            yalign: spec.yalign ?? -1,
            rtype: room_type_from_schema(
                spec.type ?? 'ordinary',
                context.definition,
            ),
            chance: spec.chance ?? 100,
            rlit: spec.lit ?? -1,
            needfill: spec.filled ?? FILL_NONE,
            joined: spec.joined ?? true,
        },
        parent,
        context.random,
        context.randomOneBased,
    );
    if (!room) {
        game.themeroom_failed = true;
        return null;
    }
    if (parent) parent.irregular = true;
    const finish = () => {
        add_doors_to_room(room);
        return room;
    };
    if (contents) {
        const maybeContents = contents(room);
        if (maybeContents && typeof maybeContents.then === 'function')
            return maybeContents.then(finish);
    }
    return finish();
}

// C refs: sp_lev.c build_room(), lspo_room(). Preserve the room construction
// boundary: chance, create, topology, deferred-fill/join flags, then contents.
function dispatch_room_action(definition, context) {
    const action = definition.action;
    const spec = action.room;
    if (action.contents && action.contents.kind !== 'themeroom-fill') {
        throw new UnsupportedThemeroomActionError(
            definition,
            `has unsupported room contents ${JSON.stringify(action.contents.kind)}`,
        );
    }
    if (action.contents) preflight_themeroom_fill(definition, context);

    const room = run_room_descriptor(
        spec,
        null,
        context,
        action.contents
            ? (created) => invoke_themeroom_fill(created, definition, context)
            : null,
    );
    const finish = (created) => created
        ? !game.themeroom_failed : false;
    return room && typeof room.then === 'function'
        ? room.then(finish) : finish(room);
}

// C ref: themerms.lua "Fake Delphi" callback.
function fake_delphi(context) {
    const room = run_room_descriptor(
        { type: 'ordinary', w: 11, h: 9, filled: FILL_NORMAL },
        null,
        context,
        (parent) => {
            run_room_descriptor(
                {
                    type: 'ordinary',
                    x: 4,
                    y: 3,
                    w: 3,
                    h: 3,
                    filled: FILL_NORMAL,
                },
                parent,
                context,
                (child) => {
                    create_room_door(
                        { state: 'random', wall: 'all' },
                        child,
                        context.random,
                    );
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Room in a room" callback.
function room_in_a_room(context) {
    const room = run_room_descriptor(
        { type: 'ordinary', filled: FILL_NORMAL },
        null,
        context,
        (parent) => {
            run_room_descriptor(
                { type: 'ordinary' },
                parent,
                context,
                (child) => {
                    create_room_door(
                        { state: 'random', wall: 'all' },
                        child,
                        context.random,
                    );
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Huge room with another room inside" callback.
function huge_room_with_another_room_inside(context) {
    const width = context.random(10) + 11;
    const height = context.random(5) + 8;
    const room = run_room_descriptor(
        { type: 'ordinary', w: width, h: height, filled: FILL_NORMAL },
        null,
        context,
        (parent) => {
            if (context.random(100) >= 90) return;
            run_room_descriptor(
                { type: 'ordinary', filled: FILL_NORMAL },
                parent,
                context,
                (child) => {
                    create_room_door(
                        { state: 'random', wall: 'all' },
                        child,
                        context.random,
                    );
                    if (context.random(100) < 50) {
                        create_room_door(
                            { state: 'random', wall: 'all' },
                            child,
                            context.random,
                        );
                    }
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Nesting rooms" callback.
function nesting_rooms(context) {
    const width = context.random(4) + 9;
    const height = context.random(4) + 9;
    const room = run_room_descriptor(
        { type: 'ordinary', w: width, h: height, filled: FILL_NORMAL },
        null,
        context,
        (parent) => {
            const parentWidth = parent.hx - parent.lx + 1;
            const parentHeight = parent.hy - parent.ly + 1;
            const minWidth = Math.floor(parentWidth / 2);
            const minHeight = Math.floor(parentHeight / 2);
            const childWidth = minWidth
                + context.random(parentWidth - 1 - minWidth);
            const childHeight = minHeight
                + context.random(parentHeight - 1 - minHeight);
            run_room_descriptor(
                {
                    type: 'ordinary',
                    w: childWidth,
                    h: childHeight,
                    filled: FILL_NORMAL,
                },
                parent,
                context,
                (child) => {
                    if (context.random(100) < 90) {
                        run_room_descriptor(
                            { type: 'ordinary', filled: FILL_NORMAL },
                            child,
                            context,
                            (grandchild) => {
                                create_room_door(
                                    { state: 'random', wall: 'all' },
                                    grandchild,
                                    context.random,
                                );
                                if (context.random(100) < 15) {
                                    create_room_door(
                                        { state: 'random', wall: 'all' },
                                        grandchild,
                                        context.random,
                                    );
                                }
                            },
                        );
                    }
                    create_room_door(
                        { state: 'random', wall: 'all' },
                        child,
                        context.random,
                    );
                    if (context.random(100) < 15) {
                        create_room_door(
                            { state: 'random', wall: 'all' },
                            child,
                            context.random,
                        );
                    }
                },
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: sp_lev.c sel_set_ter(), restricted to the SET_LIT_NOCHANGE terrain
// used by these direct handlers. Coordinates are relative to the current room.
function set_room_terrain(room, relativeX, relativeY, typ) {
    const x = room.lx + relativeX;
    const y = room.ly + relativeY;
    if (!set_levltyp(x, y, typ, { state: game })) return false;
    const location = game.level.at(x, y);
    if (typ === HWALL || typ === IRONBARS) {
        location.horizontal = true;
    } else if (typ === CLOUD) {
        del_engr_at(x, y, game);
    }
    return true;
}

// C ref: themerms.lua "Pillars" callback.
function pillars(context) {
    const room = run_room_descriptor(
        { type: 'themed', w: 10, h: 10 },
        null,
        context,
        (parent) => {
            const terrain = [
                HWALL, HWALL, HWALL, HWALL, LAVAPOOL, POOL, TREE,
            ];
            shuffle_core_values(terrain, context.random);
            const columns = Math.trunc((parent.hx - parent.lx + 1) / 4);
            const rows = Math.trunc((parent.hy - parent.ly + 1) / 4);
            for (let x = 0; x < columns; ++x) {
                for (let y = 0; y < rows; ++y) {
                    const left = x * 4 + 2;
                    const top = y * 4 + 2;
                    set_room_terrain(parent, left, top, terrain[0]);
                    set_room_terrain(parent, left + 1, top, terrain[0]);
                    set_room_terrain(parent, left, top + 1, terrain[0]);
                    set_room_terrain(parent, left + 1, top + 1, terrain[0]);
                }
            }
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

function direct_creation_environment(context) {
    return {
        state: game,
        random: context.randomFacade,
        spObjectContext: new_sp_lev_object_context(),
    };
}

// C ref: themerms.lua "Mausoleum" callback.
function mausoleum(context) {
    const creationEnvironment = direct_creation_environment(context);
    const width = 5 + context.random(3) * 2;
    const height = 5 + context.random(3) * 2;
    const room = run_room_descriptor(
        { type: 'themed', w: width, h: height },
        null,
        context,
        (parent) => {
            return run_room_descriptor(
                {
                    type: 'themed',
                    x: Math.trunc((width - 1) / 2),
                    y: Math.trunc((height - 1) / 2),
                    w: 1,
                    h: 1,
                    joined: false,
                },
                parent,
                context,
                (child) => {
                    let maybeCreation;
                    if (context.random(100) < 50) {
                        const classes = [
                            S_MUMMY, S_VAMPIRE, S_LICH, S_ZOMBIE,
                        ];
                        shuffle_core_values(classes, context.random);
                        maybeCreation = lspo_monster(
                            [{
                                class: classes[0],
                                coord: [0, 0],
                                waiting: true,
                            }],
                            child,
                            creationEnvironment,
                        );
                    } else {
                        const species = mkclass(
                            S_HUMAN,
                            G_NOGEN | G_IGNORE,
                            creationEnvironment,
                        );
                        if (!species) {
                            throw new Error(
                                'Mausoleum could not resolve a human corpse species',
                            );
                        }
                        maybeCreation = lspo_object(
                            {
                                id: CORPSE,
                                corpsenm: species.pmidx,
                                coordinate: { x: 0, y: 0 },
                            },
                            child,
                            creationEnvironment,
                        );
                    }
                    const finishCreation = () => {
                        if (context.random(100) < 20) {
                            create_room_door(
                                { state: 'secret', wall: 'all' },
                                child,
                                context.random,
                            );
                        }
                    };
                    if (maybeCreation
                        && typeof maybeCreation.then === 'function')
                        return maybeCreation.then(finishCreation);
                    return finishCreation();
                },
            );
        },
    );
    const finish = (created) => Boolean(created && !game.themeroom_failed);
    return room && typeof room.then === 'function'
        ? room.then(finish) : finish(room);
}

// C ref: themerms.lua "Random dungeon feature in the middle of an odd-sized
// room" callback.
function random_dungeon_feature_in_odd_room(context) {
    const width = 3 + context.random(3) * 2;
    const height = 3 + context.random(3) * 2;
    const room = run_room_descriptor(
        { type: 'ordinary', filled: FILL_NORMAL, w: width, h: height },
        null,
        context,
        (parent) => {
            const features = [CLOUD, LAVAPOOL, ICE, POOL, TREE];
            shuffle_core_values(features, context.random);
            set_room_terrain(
                parent,
                Math.trunc((width - 1) / 2),
                Math.trunc((height - 1) / 2),
                features[0],
            );
        },
    );
    return Boolean(room && !game.themeroom_failed);
}

// C ref: themerms.lua "Twin businesses" callback. Constructing the Lua
// placements table evaluates all twelve directional helpers before the
// shop-type swap and d(8) placement choice; retain that surprising draw order.
function twin_businesses(context) {
    const percent = (chance) => context.random(100) < chance;
    const southeast = () => (percent(50) ? 'south' : 'east');
    const northeast = () => (percent(50) ? 'north' : 'east');
    const northwest = () => (percent(50) ? 'north' : 'west');
    const southwest = () => (percent(50) ? 'south' : 'west');

    const outer = run_room_descriptor(
        { type: 'themed', w: 9, h: 5 },
        null,
        context,
        (parent) => {
            const placements = [
                {
                    lx: 1, ly: 1, rx: 4, ry: 1,
                    leftWall: 'south', rightWall: southeast(),
                },
                {
                    lx: 1, ly: 2, rx: 4, ry: 2,
                    leftWall: 'north', rightWall: northeast(),
                },
                {
                    lx: 1, ly: 1, rx: 5, ry: 1,
                    leftWall: southeast(), rightWall: southwest(),
                },
                {
                    lx: 1, ly: 1, rx: 5, ry: 2,
                    leftWall: southeast(), rightWall: northwest(),
                },
                {
                    lx: 1, ly: 2, rx: 5, ry: 1,
                    leftWall: northeast(), rightWall: southwest(),
                },
                {
                    lx: 1, ly: 2, rx: 5, ry: 2,
                    leftWall: northeast(), rightWall: northwest(),
                },
                {
                    lx: 2, ly: 1, rx: 5, ry: 1,
                    leftWall: southwest(), rightWall: 'south',
                },
                {
                    lx: 2, ly: 2, rx: 5, ry: 2,
                    leftWall: northwest(), rightWall: 'north',
                },
            ];

            let leftType = 'weapon shop';
            let rightType = 'armor shop';
            if (percent(50))
                [leftType, rightType] = [rightType, leftType];

            const shopDoorState = () => {
                if (percent(1)) return 'locked';
                if (percent(50)) return 'closed';
                return 'open';
            };
            // Lua d(#placements) is nhlib.lua math.random(1, n), which
            // nhlua.c nhl_random() evaluates as 1 + rn2(n); the one-based
            // Lua index therefore maps to this zero-based rn2() draw.
            const placement = placements[context.random(placements.length)];

            run_room_descriptor(
                {
                    type: leftType,
                    x: placement.lx,
                    y: placement.ly,
                    w: 3,
                    h: 3,
                    filled: FILL_NORMAL,
                    joined: false,
                },
                parent,
                context,
                (room) => create_room_door({
                    state: shopDoorState(),
                    wall: placement.leftWall,
                }, room, context.random),
            );
            run_room_descriptor(
                {
                    type: rightType,
                    x: placement.rx,
                    y: placement.ry,
                    w: 3,
                    h: 3,
                    filled: FILL_NORMAL,
                    joined: false,
                },
                parent,
                context,
                (room) => create_room_door({
                    state: shopDoorState(),
                    wall: placement.rightWall,
                }, room, context.random),
            );
        },
    );
    return Boolean(outer && !game.themeroom_failed);
}

const DIRECT_THEMEROOM_HANDLERS = new Map([
    ['fake-delphi', fake_delphi],
    ['room-in-a-room', room_in_a_room],
    [
        'huge-room-with-another-room-inside',
        huge_room_with_another_room_inside,
    ],
    ['nesting-rooms', nesting_rooms],
    ['pillars', pillars],
    ['mausoleum', mausoleum],
    [
        'random-dungeon-feature-in-the-middle-of-an-odd-sized-room',
        random_dungeon_feature_in_odd_room,
    ],
    ['twin-businesses', twin_businesses],
]);

function dispatch_direct_action(definition, context) {
    const handler = DIRECT_THEMEROOM_HANDLERS.get(definition.action.handler);
    if (!handler) {
        throw new UnsupportedThemeroomActionError(
            definition,
            `requires unimplemented direct handler ${JSON.stringify(definition.action.handler)}`,
        );
    }
    return handler(context);
}

// C refs: dat/nhlib.lua shuffle(); sp_lev.c lspo_replace_terrain(). nhlib's
// math.random(i) shim is 1 + nh.rn2(i), so Fisher-Yates and every matching-cell
// chance check consume the same injected core stream as the recorder.
function blocked_center_contents(definition, origin, context) {
    if (context.random(100) < 30) {
        const terrain = [HWALL, POOL];
        shuffle_core_values(terrain, context.random);
        const toTerrain = terrain[0];
        for (let x = origin.x + 1; x <= origin.x + 9; ++x) {
            for (let y = origin.y + 1; y <= origin.y + 9; ++y) {
                const loc = game.level.at(x, y);
                if (loc?.typ === LAVAPOOL && context.random(100) < 100)
                    set_levltyp(x, y, toTerrain, { state: game });
            }
        }
    }
    return filler_region(
        definition.action.contents.filler,
        origin,
        definition,
        context,
    );
}

// C refs: nhlobj.c l_obj_new_readobjnam(); objnam.c readobjnam(). The Lua
// vault passes one of four exact names to obj.new(), which parses the string
// and then constructs the result. Keep the binding's synchronous return.
function new_water_vault_escape_object(name, env) {
    return readobjnam(name, null, env);
}

// C ref: themerms.lua "Water-surrounded vault" map callback.
// C ref: nhlobj.c l_obj_add_to_container(), a Lua binding. The port runs the
// Lua program from dat/ as JavaScript, which calls the wrapped C function
// directly (obj:addcontent() in themerms.lua).
function water_surrounded_vault_contents(
    origin,
    context,
    baseCreationEnvironment,
) {
    const room = register_irregular_map_region(
        { x: origin.x + 3, y: origin.y + 3 },
        THEMEROOM,
        FILL_NONE,
        false,
        context,
    );
    if (!room) return false;

    const creationEnvironment = objectGenerationEnv({
        ...baseCreationEnvironment,
        frame: {
            xstart: origin.x,
            ystart: origin.y,
            xsize: origin.width,
            ysize: origin.height,
        },
    });
    const nastyUndead = [
        PM_GIANT_ZOMBIE,
        PM_ETTIN_ZOMBIE,
        PM_VAMPIRE_LEADER,
    ];
    const chestSpots = [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
    ];
    shuffle_core_values(chestSpots, context.random);

    const escapeNames = [
        'scroll of teleportation',
        'ring of teleportation',
        'wand of teleportation',
        'wand of digging',
    ];
    const escapeObject = new_water_vault_escape_object(
        escapeNames[context.random(escapeNames.length)],
        creationEnvironment,
    );
    const firstChestSpec = {
        id: CHEST,
        coordinate: chestSpots[0],
    };
    // themerms.lua spells this field `olocked`; lspo_object() only reads
    // `locked`, so the source retains the chest's randomly generated state.
    const firstChest = lspo_object(
        firstChestSpec,
        null,
        creationEnvironment,
    );
    add_to_container(firstChest, escapeObject, creationEnvironment);
    firstChest.owt = weight(firstChest, creationEnvironment);

    for (let index = 1; index < chestSpots.length; ++index) {
        lspo_object(
            { id: CHEST, coordinate: chestSpots[index] },
            null,
            creationEnvironment,
        );
    }

    shuffle_core_values(nastyUndead, context.random);
    // A vampire lord is a shapechanger, so makemon()'s first newcham() can
    // prompt under the wizard-mode mon_polycontrol option; C makes the
    // exclusion after the answer. lspo_monster() answers a Promise then.
    const creation = lspo_monster(
        [{
            id: nastyUndead[0],
            coord: [2, 2],
            // The source string is "vampire lord", whose male pmname makes
            // find_montype() skip its otherwise-random parser gender draw.
            ...(nastyUndead[0] === PM_VAMPIRE_LEADER
                ? { parsedGender: MALE } : {}),
        }],
        null,
        creationEnvironment,
    );
    const finish = () => {
        lspo_exclusion(
            [{ type: 'teleport', region: [2, 2, 3, 3] }],
            creationEnvironment,
        );
        return true;
    };
    return creation && typeof creation.then === 'function'
        ? creation.then(finish) : finish();
}

function dispatch_map_action(definition, context) {
    const contents = definition.action.contents;
    const supported = contents?.kind === 'filler-region'
        || (contents?.kind === 'handler'
            && (contents.handler === 'blocked-center'
                || contents.handler === 'water-surrounded-vault'));
    if (!supported) {
        const handler = contents?.handler ?? contents?.kind ?? 'missing contents';
        throw new UnsupportedThemeroomActionError(
            definition,
            `requires unimplemented map handler ${JSON.stringify(handler)}`,
        );
    }
    const waterVault = contents?.kind === 'handler'
        && contents.handler === 'water-surrounded-vault';
    const creationEnvironment = waterVault
        ? direct_creation_environment(context)
        : null;
    if (!waterVault) preflight_themeroom_fill(definition, context);

    const origin = lspo_map(definition, context.random);
    if (!origin) return false;
    if (waterVault) {
        return water_surrounded_vault_contents(
            origin,
            context,
            creationEnvironment,
        );
    }
    if (contents.kind === 'handler')
        return blocked_center_contents(definition, origin, context);
    return filler_region(contents.filler, origin, definition, context);
}

// Runtime counterpart to a selected themerms.lua contents function. Keep this
// export narrow so focused tests and future direct-name diagnostics can execute
// a source-derived descriptor without recreating reservoir selection.
export function dispatch_themeroom(definition, env = {}) {
    // The strict dispatcher currently owns the process-global level just like
    // the live generator. Reject an apparent alternate-state injection before
    // any source draw or level mutation instead of silently writing `game`.
    if (env.state !== undefined && env.state !== game) {
        throw new TypeError(
            'dispatch_themeroom only supports the global game state',
        );
    }
    // themerms.lua draws every number through nh.rn2(), nh.random() and
    // d(), all of which use C's core RNG. One random object stands for it,
    // so the room code and the fill callbacks cannot draw from different
    // streams.
    const random = env.random ?? coreRandom;
    const context = {
        definition,
        difficulty: env.difficulty ?? level_difficulty(game),
        random: random.rn2,
        randomOneBased: random.rnd,
        randomFacade: random,
        themeroomFill: env.themeroomFill,
    };
    switch (definition?.action?.kind) {
    case 'room':
        return dispatch_room_action(definition, context);
    case 'map':
        return dispatch_map_action(definition, context);
    case 'handler':
        return dispatch_direct_action(definition, context);
    default:
        throw new UnsupportedThemeroomActionError(
            definition,
            `has unsupported action ${JSON.stringify(definition?.action?.kind)}`,
        );
    }
}

// C ref: themerms.lua themerooms_generate(). Generic room descriptors use the
// strict synchronous dispatcher and the complete source-order fill reservoir.
// Every initial-generation definition now uses its registered source handler;
// dispatch_themeroom() remains the strict completion seam.
export async function themerooms_generate(difficulty, rawEnv = {}) {
    const random = rawEnv.random ?? coreRandom;
    const pick = select_themeroom(difficulty, random.rn2);
    if (!pick) return false;
    // Local closure diagnostics observe the already-selected definition;
    // absent diagnostics, this optional chain has no runtime effect.
    game._themeroomSelectionCollector?.record('room', pick.id);
    const made = await printQueued(dispatch_themeroom(pick, {
        difficulty,
        random,
        themeroomFill: rawEnv.themeroomFill ?? themeroom_fill,
    }));
    return made;
}

function create_vault() {
    return create_room(-1, -1, 2, 2, -1, -1, VAULT, true);
}

// C ref: mklev.c add_room()
function add_room(lowx, lowy, hix, hiy, lit, rtype, special) {
    const g = game;
    if (g.level.nroom >= MAXNROFROOMS)
        throw new Error('level has too many rooms');
    const croom = {
        roomnoidx: g.level.nroom,
        needfill: 0,
    };
    do_room_or_subroom(croom, lowx, lowy, hix, hiy, lit, rtype, special, true);
    g.level.rooms[g.level.nroom] = croom;
    g.level.nroom++;
    if (g.level.nroom < MAXNROFROOMS) {
        g.level.rooms[g.level.nroom] = { hx: -1 };
    }
}

// C ref: mklev.c add_subroom(). Subrooms occupy the second half of the
// conceptual rooms[] allocation, so their topology room numbers remain stable
// when the top-level room array is later sorted.
export function add_subroom(proom, lowx, lowy, hix, hiy, lit, rtype, special) {
    const g = game;
    g.subrooms ??= [];
    g.nsubroom ??= 0;
    proom.sbrooms ??= [];
    proom.nsubrooms ??= proom.sbrooms.length;
    if (g.nsubroom >= MAXNROFROOMS)
        throw new Error('level has too many subrooms');
    if (proom.nsubrooms >= MAX_SUBROOMS)
        throw new Error('room has too many subrooms');

    const croom = {
        roomnoidx: MAXNROFROOMS + 1 + g.nsubroom,
        needfill: FILL_NONE,
    };
    do_room_or_subroom(
        croom,
        lowx,
        lowy,
        hix,
        hiy,
        lit,
        rtype,
        special,
        false,
    );
    proom.sbrooms[proom.nsubrooms++] = croom;
    g.subrooms[g.nsubroom++] = croom;
    g.subrooms[g.nsubroom] = { hx: -1 };
}

// C ref: mklev.c do_room_or_subroom()
function do_room_or_subroom(croom, lowx, lowy, hix, hiy, lit, _rtype, special, is_room) {
    const map = game.level;
    if (!lowx) lowx++;
    if (!lowy) lowy++;
    if (hix >= COLNO - 1) hix = COLNO - 2;
    if (hiy >= ROWNO - 1) hiy = ROWNO - 2;
    if (lit) {
        for (let x = lowx - 1; x <= hix + 1; x++)
            for (let y = Math.max(lowy - 1, 0); y <= hiy + 1; y++)
                if (map.at(x, y)) map.at(x, y).lit = true;
        croom.rlit = 1;
    } else {
        croom.rlit = 0;
    }
    croom.lx = lowx; croom.hx = hix;
    croom.ly = lowy; croom.hy = hiy;
    croom.rtype = _rtype;
    croom.doorct = 0;
    croom.fdoor = game.level.doorindex;
    croom.irregular = false;
    croom.needjoining = !special;
    croom.nsubrooms = 0;
    croom.sbrooms = [];
    if (!special) {
        for (let x = lowx - 1; x <= hix + 1; x++)
            for (let y = lowy - 1; y <= hiy + 1; y += (hiy - lowy + 2)) {
                const loc = map.at(x, y);
                if (loc) { loc.typ = HWALL; loc.horizontal = true; }
            }
        for (let x = lowx - 1; x <= hix + 1; x += (hix - lowx + 2))
            for (let y = lowy; y <= hiy; y++) {
                const loc = map.at(x, y);
                if (loc) { loc.typ = VWALL; loc.horizontal = false; }
            }
        for (let x = lowx; x <= hix; x++)
            for (let y = lowy; y <= hiy; y++) {
                const loc = map.at(x, y);
                if (loc) loc.typ = ROOM;
            }
        if (is_room) {
            const tl = map.at(lowx - 1, lowy - 1);
            const tr = map.at(hix + 1, lowy - 1);
            const bl = map.at(lowx - 1, hiy + 1);
            const br = map.at(hix + 1, hiy + 1);
            if (tl) tl.typ = TLCORNER;
            if (tr) tr.typ = TRCORNER;
            if (bl) bl.typ = BLCORNER;
            if (br) br.typ = BRCORNER;
        } else {
            wallification(lowx - 1, lowy - 1, hix + 1, hiy + 1);
        }
    }
}

// C ref: mklev.c sort_rooms()
// C ref: mklev.c mkroom_cmp(), a stable sort on both sides (patch 002).
export function sort_rooms() {
    const g = game;
    const n = g.level.nroom;
    const oldToNew = new Array(n).fill(0);
    const liveRooms = g.level.rooms.slice(0, n)
        .sort((a, b) => (a?.lx || 0) - (b?.lx || 0));
    g.level.rooms = liveRooms;
    if (n < MAXNROFROOMS) g.level.rooms[n] = { hx: -1 };
    for (let i = 0; i < n; i++) {
        if (g.level.rooms[i]) {
            oldToNew[g.level.rooms[i].roomnoidx] = i;
            g.level.rooms[i].roomnoidx = i;
        }
    }
    for (let x = 1; x < COLNO; x++)
        for (let y = 0; y < ROWNO; y++) {
            const loc = g.level.at(x, y);
            const rno = loc?.roomno ?? 0;
            if (rno >= ROOMOFFSET && rno < MAXNROFROOMS + 1) {
                loc.roomno = oldToNew[rno - ROOMOFFSET] + ROOMOFFSET;
            }
        }
}

// C ref: mklev.c topologize()
export function topologize(croom, state = game) {
    if (!croom || croom.irregular) return;
    const roomno = ROOM_INDEX(croom) + ROOMOFFSET;
    const lowx = croom.lx, lowy = croom.ly;
    const hix = croom.hx, hiy = croom.hy;
    if (!state.level) return;
    if ((state.level.at(lowx, lowy)?.roomno ?? 0) === roomno) return;
    for (let x = lowx; x <= hix; x++)
        for (let y = lowy; y <= hiy; y++) {
            const loc = state.level.at(x, y);
            if (loc) loc.roomno = roomno;
        }
    for (let x = lowx - 1; x <= hix + 1; x++)
        for (let y = lowy - 1; y <= hiy + 1; y += (hiy - lowy + 2)) {
            const loc = state.level.at(x, y);
            if (loc) { loc.edge = true; loc.roomno = loc.roomno ? SHARED : roomno; }
        }
    for (let x = lowx - 1; x <= hix + 1; x += (hix - lowx + 2))
        for (let y = lowy; y <= hiy; y++) {
            const loc = state.level.at(x, y);
            if (loc) { loc.edge = true; loc.roomno = loc.roomno ? SHARED : roomno; }
        }
}

// ============================================================
// Corridors
// ============================================================

function good_rm_wall_doorpos(x, y, dir, room) {
    const map = game.level;
    const rmno = ROOM_INDEX(room) + ROOMOFFSET;
    if (!isok(x, y) || !room.needjoining) return false;
    const loc = map.at(x, y);
    if (!loc) return false;
    if (!(loc.typ === HWALL || loc.typ === VWALL || IS_DOOR(loc.typ) || loc.typ === SDOOR))
        return false;
    if (bydoor(x, y)) return false;
    const tx = x + xdir[dir], ty = y + ydir[dir];
    if (!isok(tx, ty)) return false;
    const tloc = map.at(tx, ty);
    if (!tloc || IS_OBSTRUCTED(tloc.typ)) return false;
    if (rmno !== tloc.roomno) return false;
    return true;
}

function finddpos_shift(xp, yp, dir, aroom) {
    const rdir = DIR_180(dir);
    if (good_rm_wall_doorpos(xp.v, yp.v, rdir, aroom)) return true;
    // C ref: mklev.c finddpos_shift(). An irregular room's actual wall can be
    // inset from its rectangular bounds; walk inward through rock/corridor to
    // find the first usable wall on that side.
    if (aroom.irregular) {
        const dx = xdir[rdir], dy = ydir[rdir];
        let rx = xp.v, ry = yp.v;
        let fail = false;
        for (;;) {
            const loc = game.level.at(rx, ry);
            if (fail || !isok(rx, ry) || !loc
                || (loc.typ !== STONE && loc.typ !== CORR)) break;
            rx += dx;
            ry += dy;
            if (good_rm_wall_doorpos(rx, ry, rdir, aroom)) {
                xp.v = rx;
                yp.v = ry;
                return true;
            }
            const shifted = game.level.at(rx, ry);
            if (!shifted || (shifted.typ !== STONE && shifted.typ !== CORR)) fail = true;
            if (rx < aroom.lx || rx > aroom.hx || ry < aroom.ly || ry > aroom.hy)
                fail = true;
        }
    }
    return false;
}

// C ref: mklev.c finddpos()
function finddpos(cc, dir, aroom) {
    let x1, y1, x2, y2;
    switch (dir) {
    case DIR_N: x1 = aroom.lx; x2 = aroom.hx; y1 = y2 = aroom.ly - 1; break;
    case DIR_S: x1 = aroom.lx; x2 = aroom.hx; y1 = y2 = aroom.hy + 1; break;
    case DIR_W: x1 = x2 = aroom.lx - 1; y1 = aroom.ly; y2 = aroom.hy; break;
    case DIR_E: x1 = x2 = aroom.hx + 1; y1 = aroom.ly; y2 = aroom.hy; break;
    default:
        // C: impossible("finddpos: illegal dir");
        sync_impossible('finddpos: illegal dir', game);
        return false;
    }
    let tryct = 0;
    let x, y;
    do {
        x = (x2 - x1) ? rn1(x2 - x1 + 1, x1) : x1;
        y = (y2 - y1) ? rn1(y2 - y1 + 1, y1) : y1;
        const xp = { v: x }, yp = { v: y };
        if (finddpos_shift(xp, yp, dir, aroom)) {
            cc.x = xp.v; cc.y = yp.v;
            return true;
        }
    } while (++tryct < 20);
    for (x = x1; x <= x2; x++)
        for (y = y1; y <= y2; y++) {
            const xp = { v: x }, yp = { v: y };
            if (finddpos_shift(xp, yp, dir, aroom)) {
                cc.x = xp.v; cc.y = yp.v;
                return true;
            }
        }
    cc.x = x1; cc.y = y1;
    return false;
}

export function maybe_sdoor(chance) {
    const d = depth(game.u?.uz);
    return (d > 2) && !rn2(Math.max(2, chance));
}

// C ref: mklev.c dosdoor(). The trapped-door mimic is the only step that can
// wait: a level program that #wizloadlua runs (nhlua.c load_lua()) reaches it
// outside level creation through sp_lev.c create_corridor() ->
// makecorridors() -> join() -> dodoor(), where makemon() takes its runtime
// form. dosdoor() then returns a Promise.
// C ref: mklev.c dosdoor(). level_difficulty()'s builds_up() reports a level
// of dungeon -1 through impossible(); makeniche() waits and drives
// dosdoor_steps() with impossible_printer(), and this synchronous form, for
// the other callers, queues the report.
function dosdoor(x, y, aroom, type) {
    return finish_steps(dosdoor_steps(x, y, aroom, type), sync_impossible, game);
}

function* dosdoor_steps(x, y, aroom, type) {
    const map = game.level;
    const loc = map.at(x, y);
    if (!loc) return;
    const shdoor = in_rooms(x, y, SHOPBASE).length > 0;
    if (!IS_WALL(loc.typ)) type = DOOR;
    loc.typ = type;
    if (type === DOOR) {
        if (!rn2(3)) {
            if (!rn2(5)) loc.flags = D_ISOPEN;
            else if (!rn2(6)) loc.flags = D_LOCKED;
            else loc.flags = D_CLOSED;
            if (loc.flags !== D_ISOPEN && !shdoor
                && (yield* level_difficulty_steps(game)) >= 5 && !rn2(25))
                loc.flags |= D_TRAPPED;
        } else {
            loc.flags = shdoor ? D_ISOPEN : D_NODOOR;
        }
        // C's mklev.c:dosdoor clears this mask before the trapped-door mimic
        // check on Rogue levels; roguecorr() also clears it after carving.
        if (Is_rogue_level(game.u?.uz))
            loc.flags = D_NODOOR;
        if (loc.flags & D_TRAPPED) {
            if ((yield* level_difficulty_steps(game)) >= 9 && !rn2(5)
                && !([PM_SMALL_MIMIC, PM_LARGE_MIMIC, PM_GIANT_MIMIC]
                    .every(pm => game.mvitals[pm].mvflags & G_GONE))) {
                loc.flags = D_NODOOR;
                const mimic = yield makemon_by_context(
                    yield* mkclass_steps(S_MIMIC, 0, { state: game }),
                    x, y, NO_MM_FLAGS, { state: game },
                );
                if (mimic) set_mimic_sym(mimic, { state: game });
            }
        }
    } else {
        if (shdoor || !rn2(5)) loc.flags = D_LOCKED;
        else loc.flags = D_CLOSED;
        if (!shdoor && (yield* level_difficulty_steps(game)) >= 4 && !rn2(20))
            loc.flags |= D_TRAPPED;
    }
    add_door(x, y, aroom);
}

// C ref: mklev.c dodoor(). Returns dosdoor()'s Promise when it waits.
// join() reaches it through dodoor_steps(); this synchronous form is
// extralev.c roguecorr()'s, on the Rogue level.
function dodoor(x, y, aroom) {
    return dosdoor(x, y, aroom, maybe_sdoor(8) ? SDOOR : DOOR);
}

function* dodoor_steps(x, y, aroom) {
    return yield* dosdoor_steps(x, y, aroom, maybe_sdoor(8) ? SDOOR : DOOR);
}

export function add_door(x, y, aroom) {
    const g = game;
    if (!g.level.doors) g.level.doors = [];
    for (let i = 0; i < aroom.doorct; i++) {
        const d = g.level.doors[aroom.fdoor + i];
        if (d && d.x === x && d.y === y) return;
    }
    // level.doors concatenates each room's [fdoor, fdoor + doorct) slice.
    // Inserting into an earlier slice shifts every later room's starting index.
    if (aroom.doorct === 0) aroom.fdoor = g.level.doorindex;
    aroom.doorct++;
    for (let tmp = g.level.doorindex; tmp > aroom.fdoor; tmp--)
        g.level.doors[tmp] = g.level.doors[tmp - 1];
    for (let i = 0; i < g.level.nroom; ++i) {
        const broom = g.level.rooms[i];
        if (!broom || broom === aroom || !(broom.doorct > 0)) continue;
        if ((broom.fdoor ?? 0) >= aroom.fdoor) broom.fdoor++;
    }
    for (let i = 0; i < (g.nsubroom ?? 0); ++i) {
        const broom = g.subrooms?.[i];
        if (!broom || broom === aroom || !(broom.doorct > 0)) continue;
        if ((broom.fdoor ?? 0) >= aroom.fdoor) broom.fdoor++;
    }
    g.level.doors[aroom.fdoor] = { x, y };
    g.level.doorindex++;
}

function bydoor(x, y) {
    const map = game.level;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isok(x + dx, y + dy)) continue;
        const loc = map.at(x + dx, y + dy);
        if (loc && (IS_DOOR(loc.typ) || loc.typ === SDOOR)) return true;
    }
    return false;
}

export function okdoor(x, y) {
    const map = game.level;
    const loc = map.at(x, y);
    if (!loc) return false;
    if (!(loc.typ === HWALL || loc.typ === VWALL)) return false;
    if (bydoor(x, y)) return false;
    return (
        (isok(x - 1, y) && !IS_OBSTRUCTED(map.at(x - 1, y).typ))
        || (isok(x + 1, y) && !IS_OBSTRUCTED(map.at(x + 1, y).typ))
        || (isok(x, y - 1) && !IS_OBSTRUCTED(map.at(x, y - 1).typ))
        || (isok(x, y + 1) && !IS_OBSTRUCTED(map.at(x, y + 1).typ))
    );
}

// C ref: mklev.c join(). Waits only where dodoor() does.
function* join_steps(a, b, nxcor) {
    const g = game;
    const croom = g.level.rooms[a];
    const troom = g.level.rooms[b];
    if (!croom || !troom) return;
    if (!croom.needjoining || !troom.needjoining) return;
    if (troom.hx < 0 || croom.hx < 0) return;
    let dx, dy;
    const cc = { x: 0, y: 0 }, tt = { x: 0, y: 0 };
    if (troom.lx > croom.hx) {
        dx = 1; dy = 0;
        if (!finddpos(cc, DIR_E, croom)) return;
        if (!finddpos(tt, DIR_W, troom)) return;
    } else if (troom.hy < croom.ly) {
        dy = -1; dx = 0;
        if (!finddpos(cc, DIR_N, croom)) return;
        if (!finddpos(tt, DIR_S, troom)) return;
    } else if (troom.hx < croom.lx) {
        dx = -1; dy = 0;
        if (!finddpos(cc, DIR_W, croom)) return;
        if (!finddpos(tt, DIR_E, troom)) return;
    } else {
        dy = 1; dx = 0;
        if (!finddpos(cc, DIR_S, croom)) return;
        if (!finddpos(tt, DIR_N, troom)) return;
    }
    const xx = cc.x, yy = cc.y;
    const tx = tt.x - dx, ty = tt.y - dy;
    if (nxcor) {
        const loc = game.level.at(xx + dx, yy + dy);
        if (loc && loc.typ !== STONE) return;
    }
    const org = { x: xx + dx, y: yy + dy };
    const dest = { x: tx, y: ty };
    const npoints = { v: 0 };
    const ftyp = CORR;
    const dig_result = dig_corridor(org, dest, npoints, nxcor, ftyp, STONE);
    if ((npoints.v > 0) && (okdoor(xx, yy) || !nxcor))
        yield* dodoor_steps(xx, yy, croom);
    if (!dig_result) return;
    if (okdoor(tt.x, tt.y) || !nxcor)
        yield* dodoor_steps(tt.x, tt.y, troom);
    if (g.smeq[a] < g.smeq[b]) g.smeq[b] = g.smeq[a];
    else g.smeq[a] = g.smeq[b];
}

// C ref: mklev.c makecorridors(). makelevel() drives makecorridors_steps()
// with impossible_printer(), so dosdoor()'s level_difficulty() report for a
// level of dungeon -1 prints where C prints it. Synchronous during level
// creation; a
// Promise when a door's mimic waits for makemon()'s runtime form (dosdoor()).
export function makecorridors() {
    return finish_steps(makecorridors_steps(), sync_impossible, game);
}

function* makecorridors_steps() {
    const g = game;
    let any = true;
    for (let a = 0; a < g.level.nroom - 1; a++) {
        yield* join_steps(a, a + 1, false);
        if (!rn2(50)) break;
    }
    for (let a = 0; a < g.level.nroom - 2; a++)
        if (g.smeq[a] !== g.smeq[a + 2]) yield* join_steps(a, a + 2, false);
    for (let a = 0; any && a < g.level.nroom; a++) {
        any = false;
        for (let b = 0; b < g.level.nroom; b++) {
            if (g.smeq[a] !== g.smeq[b]) {
                yield* join_steps(a, b, false);
                any = true;
            }
        }
    }
    if (g.level.nroom > 2) {
        const count = rn2(g.level.nroom) + 4;
        for (let i = 0; i < count; i++) {
            let a = rn2(g.level.nroom);
            let b = rn2(g.level.nroom - 2);
            if (b >= a) b += 2;
            yield* join_steps(a, b, true);
        }
    }
}

// Keep the long-standing mklev.js surface while the shared implementation
// lives below both level generation and themed-fill creation.
export {
    add_room,
    dodoor,
    dosdoor,
    get_free_room_loc,
    get_location,
    get_location_coord,
    get_room_loc,
    inside_room,
    is_ok_location,
    mk_knox_portal,
    occupied,
    place_branch,
    somex,
    somey,
    somexy,
    traptype_rnd,
    walkfrom,
};

// C ref: mkroom.c somexyspace(). The source do-while attempts one initial
// candidate plus at most 100 retries, for 101 total calls to somexy().
export function somexyspace(croom, c, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = { ...rawEnv, state };
    let tryCnt = 0;
    let okay;
    do {
        okay = somexy(croom, c, env)
            && isok(c.x, c.y)
            && !occupied(c.x, c.y, state)
            && (state.level.at(c.x, c.y).typ === ROOM
                || state.level.at(c.x, c.y).typ === CORR
                || state.level.at(c.x, c.y).typ === ICE);
    } while (tryCnt++ < 100 && !okay);
    return okay;
}

// ============================================================
// Stairs
// ============================================================

export function generate_stairs_room_good(croom, phase, state = game) {
    // C ref: mklev.c generates stair candidates through has_dnstairs() and
    // has_upstairs(). Their inside_room() check distinguishes irregular room
    // membership from overlapping room bounds and includes regular room walls.
    return Boolean(croom
        && (croom.needjoining || phase < 0)
        && ((!has_dnstairs(croom, state) && !has_upstairs(croom, state))
            || phase < 1)
        && (croom.rtype === OROOM
            || (phase < 2 && croom.rtype === THEMEROOM)));
}

function generate_stairs_find_room() {
    const g = game;
    if (!g.level.nroom) return null;
    for (let phase = 2; phase > -1; phase--) {
        const candidates = [];
        for (let i = 0; i < g.level.nroom; i++)
            if (generate_stairs_room_good(g.level.rooms[i], phase))
                candidates.push(i);
        if (candidates.length > 0) {
            const pick = rn2(candidates.length);
            return g.level.rooms[candidates[pick]];
        }
    }
    return g.level.rooms[rn2(g.level.nroom)];
}

// C ref: mklev.c mkstairs() (2159-2196). Its two impossible() reports, for
// an off-map square and for a square that is not floor, print through the
// caller's onImpossible (js/source_steps.js); every caller waits for it.
export function mkstairs(x, y, up, croom, force = false, onImpossible) {
    return finish_steps(mkstairs_steps(x, y, up, croom, force),
        onImpossible ?? sync_impossible, game);
}

function* mkstairs_steps(x, y, up, croom, force) {
    const g = game;
    if (!x || !isok(x, y)) {
        yield new ImpossibleCall(
            `mkstairs:  bogus stair attempt at <${x},${y}>`);
        return;
    }
    const loc = g.level.at(x, y);
    // mklev.c:2172–2173: fixed descriptors force ROOM even when the
    // dungeon-end guard below refuses the stair itself.
    if (force) loc.typ = ROOM;
    const ltyp = loc.typ; /* somexyspace() allows ice */
    if (ltyp !== ROOM && ltyp !== CORR && ltyp !== ICE) {
        const glyph = yield* back_to_glyph_steps(x, y, g);
        const sidx = glyph_to_cmap(glyph);
        yield new ImpossibleCall(`mkstairs:  placing stairs ${
            up ? 'up' : 'down'} on ${CMAP_EXPLANATIONS[sidx]} at <${x},${y}>`);
    }
    // C ref: mklev.c mkstairs():2183-2189. A regular stair cannot be
    // created at either end of a dungeon branch; the Lua `des.stair("up")`
    // on Mines level 1 therefore creates no stairway or STAIRS terrain.
    if (dunlev(g.u.uz) === (up ? 1 : dunlevs_in_dungeon(g.u.uz, g)))
        return;
    loc.typ = STAIRS;
    loc.flags = up ? LA_UP : LA_DOWN; // rm.h: ladder aliases flags
    const dest = {
        dnum: g.u?.uz?.dnum ?? 0,
        dlevel: (g.u?.uz?.dlevel ?? 1) + (up ? -1 : 1),
    };
    stairway_add(x, y, !!up, false, dest);
    if (up) g.level.upstair = { x, y };
    else g.level.dnstair = { x, y };
}

async function generate_stairs() {
    const g = game;
    const pos = { x: 0, y: 0 };
    // Down stairs
    {
        const croom = generate_stairs_find_room();
        if (croom) {
            if (!somexyspace(croom, pos)) {
                pos.x = somex(croom);
                pos.y = somey(croom);
            }
            await mkstairs(pos.x, pos.y, 0, croom, false,
                impossible_printer(g));
        }
    }
    // Up stairs only if not level 1
    if ((g.u?.uz?.dlevel ?? 1) !== 1) {
        const croom = generate_stairs_find_room();
        if (croom) {
            if (!somexyspace(croom, pos)) {
                pos.x = somex(croom);
                pos.y = somey(croom);
            }
            await mkstairs(pos.x, pos.y, 1, croom, false,
                impossible_printer(g));
        }
    }
}

// ============================================================
// Niches
// ============================================================

function cardinal_nextto_room(aroom, x, y) {
    const map = game.level;
    const rmno = ROOM_INDEX(aroom) + ROOMOFFSET;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (!isok(x + dx, y + dy)) continue;
        const loc = map.at(x + dx, y + dy);
        if (loc && !loc.edge && loc.roomno === rmno) return true;
    }
    return false;
}

function place_niche(aroom) {
    let dy;
    const dd = { x: 0, y: 0 };
    if (rn2(2)) {
        dy = 1;
        if (!finddpos(dd, DIR_S, aroom)) return null;
    } else {
        dy = -1;
        if (!finddpos(dd, DIR_N, aroom)) return null;
    }
    const xx = dd.x, yy = dd.y;
    const niche = game.level.at(xx, yy + dy);
    const back = game.level.at(xx, yy - dy);
    if (!niche || niche.typ !== STONE) return null;
    if (!back || IS_POOL(back.typ) || IS_FURNITURE(back.typ)) return null;
    if (!cardinal_nextto_room(aroom, xx, yy)) return null;
    return { dy, xx, yy };
}

export async function makeniche(trap_type) {
    const g = game;
    let vct = 8;
    while (vct--) {
        const aroom = g.level.rooms[rn2(g.level.nroom)];
        if (!aroom || aroom.rtype !== OROOM) continue;
        if (aroom.doorct === 1 && rn2(5)) continue;
        const niche = place_niche(aroom);
        if (!niche) continue;
        const { dy, xx, yy } = niche;
        const rm = g.level.at(xx, yy + dy);
        if (!rm) continue;
        if (trap_type || !rn2(4)) {
            rm.typ = SCORR;
            if (trap_type) {
                if (is_hole(trap_type) && !Can_fall_thru(g.u.uz, g))
                    trap_type = ROCKTRAP;
                const trap = await maketrap_async(xx, yy + dy, trap_type);
                if (trap) {
                    if (trap_type !== ROCKTRAP) trap.once = true;
                    const engraving = TRAP_ENGRAVINGS.get(trap_type);
                    if (engraving) {
                        make_engr_at(xx, yy - dy, engraving, null, 0, DUST);
                        wipe_engr_at(xx, yy - dy, 5, false);
                    }
                }
            }
            await finish_steps(dosdoor_steps(xx, yy, aroom, SDOOR),
                impossible_printer(g));
            if (noticesQueued()) await emitQueuedNotices();
        } else {
            rm.typ = CORR;
            if (rn2(7)) {
                await finish_steps(
                    dosdoor_steps(xx, yy, aroom, rn2(5) ? SDOOR : DOOR),
                    impossible_printer(g));
                if (noticesQueued()) await emitQueuedNotices();
            } else {
                const loc = g.level.at(xx, yy);
                if (!rn2(5) && loc && IS_WALL(loc.typ)) {
                    set_levltyp(xx, yy, IRONBARS, { state: g });
                    if (rn2(3)) {
                        const species = await finish_steps(
                            mkclass_steps(S_HUMAN, 0, { state: g }),
                            impossible_printer(g));
                        mkcorpstat(
                            CORPSE,
                            null,
                            species,
                            xx,
                            yy + dy,
                            1,
                            levelObjectEnv(),
                        );
                    }
                }
                if (!g.level.flags.noteleport) {
                    await mksobj_at(
                        SCR_TELEPORTATION,
                        xx,
                        yy + dy,
                        true,
                        false,
                        levelObjectEnv(),
                    );
                }
                if (!rn2(3)) {
                    await mkobj_at(
                        RANDOM_CLASS,
                        xx,
                        yy + dy,
                        true,
                        levelObjectEnv(),
                    );
                }
            }
        }
        return;
    }
}

// C ref: mklev.c make_niches(). The thresholds read depth(&u.uz), which
// differs from dlevel outside the Dungeons of Doom, as in dungeon -1.
async function make_niches() {
    const g = game;
    let ct = rnd((g.level.nroom >> 1) + 1);
    const dep = depth(g.u.uz, g);
    let ltptr = !g.level.flags.noteleport && dep > 15;
    let vamp = dep > 5 && dep < 25;
    while (ct--) {
        if (ltptr && !rn2(6)) {
            ltptr = false;
            await makeniche(LEVEL_TELEP);
        } else if (vamp && !rn2(6)) {
            vamp = false;
            await makeniche(TRAPDOOR);
        } else {
            await makeniche(NO_TRAP);
        }
    }
}

// C ref: mklev.c chk_okdoor() (1197-1219). A door is not ok when the squares
// on its two open sides differ: one is solid terrain (typ <= TREE) and the
// other is not. Pure: reads the map only.
export function chk_okdoor(x, y, state = game) {
    const typAt = (tx, ty) => state.level.at(tx, ty).typ;
    if (!IS_DOOR(typAt(x, y))) return true;
    if (state.level.at(x, y).horizontal) {
        if ((isok(x, y - 1) && typAt(x, y - 1) > TREE)
            && (isok(x, y + 1) && typAt(x, y + 1) <= TREE))
            return false;
        if ((isok(x, y - 1) && typAt(x, y - 1) <= TREE)
            && (isok(x, y + 1) && typAt(x, y + 1) > TREE))
            return false;
    } else {
        if ((isok(x - 1, y) && typAt(x - 1, y) > TREE)
            && (isok(x + 1, y) && typAt(x + 1, y) <= TREE))
            return false;
        if ((isok(x - 1, y) && typAt(x - 1, y) <= TREE)
            && (isok(x + 1, y) && typAt(x + 1, y) > TREE))
            return false;
    }
    return true;
}

// C ref: mklev.c mklev_sanity_check() (1222-1246). makelevel() calls it
// after make_niches() on a room-and-corridor level. It runs outside
// sanity_check(), so each impossible() prints its full "Program in
// disorder!" block. makecorridors() can leave a room unjoined, since join()
// returns without merging smeq[] when finddpos() or dig_corridor() fails,
// so "room %i not connected?" reports a level C really makes. `env` passes
// impossible()'s message operations through, which a test can replace.
export async function mklev_sanity_check(state = game, env = {}) {
    let rmno = -1;

    if (!(state.iflags?.sanity_check || state.iflags?.debug_fuzzer))
        return;

    for (let y = 0; y < ROWNO; y++) {
        for (let x = 1; x < COLNO; x++) {
            if (!chk_okdoor(x, y, state))
                await impossible(`levl[${x}][${y}] door not ok`, state, env);
        }
    }

    for (let i = 0; i < state.level.nroom; i++) {
        if (!state.level.rooms[i].needjoining)
            continue;
        if (rmno === -1)
            rmno = state.smeq[i];
        if (rmno !== -1 && state.smeq[i] !== rmno)
            await impossible(`room ${i} not connected?`, state, env);
    }
}

// ============================================================
// Branch placement
// ============================================================

function is_branchlev() {
    const g = game;
    if (!g.branches) return null;
    for (const br of g.branches) {
        if (br?.end1?.dnum === (g.u?.uz?.dnum ?? 0) && br?.end1?.dlevel === (g.u?.uz?.dlevel ?? 1)) return br;
        if (br?.end2?.dnum === (g.u?.uz?.dnum ?? 0) && br?.end2?.dlevel === (g.u?.uz?.dlevel ?? 1)) return br;
    }
    return null;
}

// C ref: mklev.c find_branch_room(). C's mazexy() reads the maze bounds
// gx.x_maze_max and gy.y_maze_max; `frame` carries them here. makemaz() is the
// only caller that reaches the roomless arm, and it passes its frame.
async function find_branch_room(mp, frame) {
    const g = game;
    let croom = null;

    if (g.level.nroom === 0) {
        mazexy(mp, frame, g); /* already verifies location */
    } else {
        croom = generate_stairs_find_room();
        if (!somexyspace(croom, mp))
            await impossible("Can't place branch!", g);
    }
    return croom;
}

// C ref: mklev.c place_branch(). When x is nonzero the branch is placed at
// (x, y) directly; otherwise find_branch_room picks a random location. C's
// pos_to_room() call for a given location discards its result and has no
// effect. `frame` holds the maze bounds that find_branch_room() needs.
async function place_branch(branchp, x = 0, y = 0, frame = undefined) {
    const g = game;
    if (!branchp || g.made_branch) return;
    if (!x) { /* find random coordinates for branch */
        const mp = { x: 0, y: 0 };
        await find_branch_room(mp, frame);
        x = mp.x;
        y = mp.y;
    }
    const on_end1 = on_level(branchp.end1, g.u.uz);
    /* on end1, make_stairs unless BR_NO_END1; on end2, unless BR_NO_END2 */
    const make_stairs = on_end1
        ? branchp.type !== BR_NO_END1
        : branchp.type !== BR_NO_END2;
    const dest = on_end1 ? branchp.end2 : branchp.end1;
    // C ref: mklev.c:1727-1739. The iflags.debug_fuzzer arm needs the
    // fuzzer, which a recorded session cannot enable.
    if (branchp.type === BR_PORTAL) {
        await printQueued(mkportal(x, y, dest.dnum, dest.dlevel, g));
    } else if (make_stairs) {
        const goes_up = on_end1 ? !!branchp.end1_up : !branchp.end1_up;
        stairway_add(x, y, goes_up, false, dest);
        set_levltyp(x, y, STAIRS, { state: g });
        g.level.at(x, y).flags = goes_up ? LA_UP : LA_DOWN; /* ladder */
    }
    /* C sets made_branch even when no stairwell was made: there is only
       one branch per level, so a second attempt would fail too. */
    g.made_branch = true;
}

// C ref: detect.c premap_detect() (2134-2159). Reveals the full map for
// premapped levels (Sokoban). Called after fixup_special so branch stairs
// are included.
// C ref: detect.c skip_premap_detect().
export function premap_detect(state) {
    for (let x = 1; x < COLNO; x++) {
        for (let y = 0; y < ROWNO; y++) {
            const loc = state.level.at(x, y);
            if (loc.typ === STONE
                && (loc.flags & (W_NONDIGGABLE | W_NONPASSWALL)) !== 0)
                continue;
            loc.seenv = SVALL;
            loc.waslit = true;
            if (loc.typ === SDOOR) loc.flags = 0;
            map_background(x, y, 1, state);
            const obj = sobj_at(BOULDER, x, y, state);
            if (obj) map_object(obj, 1, state);
        }
    }
    for (const trap of state.level.traps) {
        trap.tseen = 1;
        map_trap(trap, 1, state);
    }
}

// ============================================================
// Wallification
// ============================================================

function extend_spine(locale, wall_there, dx, dy) {
    const nx = 1 + dx, ny = 1 + dy;
    if (!wall_there) return 0;
    if (dx) {
        if (locale[1][0] && locale[1][2] && locale[nx][0] && locale[nx][2]) return 0;
        return 1;
    }
    if (locale[0][1] && locale[2][1] && locale[0][ny] && locale[2][ny]) return 0;
    return 1;
}
function wall_cleanup(x1, y1, x2, y2, state = game) {
    /* sanity check on incoming variables */
    if (x1 < 0 || x2 >= COLNO || x1 > x2 || y1 < 0 || y2 >= ROWNO || y1 > y2)
        throw new Error(`wall_cleanup: bad bounds (${x1},${y1}) to (${x2},${y2})`);
    const map = state.level;
    if (!map) return;
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
            const protectedArea = state.bughack?.inarea;
            if (protectedArea && within_bounded_area(
                x, y,
                protectedArea.x1, protectedArea.y1,
                protectedArea.x2, protectedArea.y2,
            )) continue;
            const loc = map.at(x, y);
            const typ = loc?.typ ?? STONE;
            if (!(IS_WALL(typ) && typ !== DBWALL)) continue;
            if (is_solid(x-1,y-1,state) && is_solid(x-1,y,state)
                && is_solid(x-1,y+1,state) && is_solid(x,y-1,state)
                && is_solid(x,y+1,state) && is_solid(x+1,y-1,state)
                && is_solid(x+1,y,state) && is_solid(x+1,y+1,state))
                loc.typ = STONE;
        }
}
export function fix_wall_spines(x1, y1, x2, y2, state = game) {
    const spineArray = [VWALL, HWALL, HWALL, HWALL,
        VWALL, TRCORNER, TLCORNER, TDWALL,
        VWALL, BRCORNER, BLCORNER, TUWALL,
        VWALL, TLWALL, TRWALL, CROSSWALL];
    /* sanity check on incoming variables */
    if (x1 < 0 || x2 >= COLNO || x1 > x2 || y1 < 0 || y2 >= ROWNO || y1 > y2)
        throw new Error(`wall_extends: bad bounds (${x1},${y1}) to (${x2},${y2})`);
    const map = state.level;
    if (!map) return;
    for (let x = x1; x <= x2; x++)
        for (let y = y1; y <= y2; y++) {
            const loc = map.at(x, y);
            const typ = loc?.typ ?? STONE;
            if (!(IS_WALL(typ) && typ !== DBWALL)) continue;
            const protectedArea = state.bughack?.inarea;
            const locationTest = protectedArea && within_bounded_area(
                x, y,
                protectedArea.x1, protectedArea.y1,
                protectedArea.x2, protectedArea.y2,
            ) ? iswall : iswall_or_stone;
            const locale = [
                [locationTest(x-1,y-1,state), locationTest(x-1,y,state), locationTest(x-1,y+1,state)],
                [locationTest(x,y-1,state), 0, locationTest(x,y+1,state)],
                [locationTest(x+1,y-1,state), locationTest(x+1,y,state), locationTest(x+1,y+1,state)],
            ];
            const bits = (extend_spine(locale, iswall(x,y-1,state), 0, -1) << 3)
                | (extend_spine(locale, iswall(x,y+1,state), 0, 1) << 2)
                | (extend_spine(locale, iswall(x+1,y,state), 1, 0) << 1)
                | extend_spine(locale, iswall(x-1,y,state), -1, 0);
            if (bits) loc.typ = spineArray[bits];
        }
}
export function wallification(x1, y1, x2, y2, state = game) {
    wall_cleanup(x1, y1, x2, y2, state);
    fix_wall_spines(x1, y1, x2, y2, state);
}

// ============================================================
// Fill ordinary room
// ============================================================

const SUPPLY_ITEMS = [
    POT_EXTRA_HEALING,
    POT_SPEED,
    POT_GAIN_ENERGY,
    SCR_ENCHANT_WEAPON,
    SCR_ENCHANT_ARMOR,
    SCR_CONFUSE_MONSTER,
    SCR_SCARE_MONSTER,
    WAN_DIGGING,
    SPE_HEALING,
];

// Built per call rather than at module scope. SPBOOK_NO_NOVEL is a js/mkobj.js
// module-scope const, and js/mkobj.js imports js/eat.js, which since the #eat
// command landed reaches this file: a module-scope read here would run while
// js/mkobj.js's own body is still in its temporal dead zone. The table is read
// once per supply chest, so rebuilding it costs nothing a level pays.
function supplyExtraClasses() {
    return [
        FOOD_CLASS,
        WEAPON_CLASS,
        ARMOR_CLASS,
        GEM_CLASS,
        SCROLL_CLASS,
        POTION_CLASS,
        RING_CLASS,
        SPBOOK_NO_NOVEL,
        SPBOOK_NO_NOVEL,
        SPBOOK_NO_NOVEL,
    ];
}

function isMinesEntrance(branch, state) {
    const mines = state.mines_dnum;
    return Boolean(branch
        && state.u.uz.dnum !== mines
        && (branch.end1?.dnum === mines || branch.end2?.dnum === mines));
}

// C ref: mklev.c fill_ordinary_room(), the supply-chest arm above the
// Oracle (1036-1127).
export function fill_ordinary_room_supply_chest(position, env) {
    const { state } = env;
    const random = env.random?.rn2 ?? rn2;
    const chest = mksobj_at(
        random(3) ? CHEST : LARGE_BOX,
        position.x,
        position.y,
        false,
        false,
        env,
    );
    chest.olocked = Boolean(random(6));

    let tries = 0;
    let cursed;
    do {
        const otyp = random(2)
            ? POT_HEALING
            : SUPPLY_ITEMS[random(SUPPLY_ITEMS.length)];
        const obj = mksobj(otyp, true, false, env);
        if (otyp === POT_HEALING && random(2)) {
            obj.quan = 2;
            obj.owt = weight(obj, env);
        }
        cursed = obj.cursed;
        add_to_container(chest, obj, env);
        if (++tries === 50) {
            // C (mklev.c fill_ordinary_room()):
            // impossible("couldn't generate supply chest item");
            sync_impossible("couldn't generate supply chest item", state);
            break;
        }
    } while (cursed || !random(5));

    if (random(3)) {
        const extraClasses = supplyExtraClasses();
        const objectClass = extraClasses[random(extraClasses.length)];
        let obj = mkobj(objectClass, false, env);
        if (objectClass === SPBOOK_NO_NOVEL) {
            const maxPass = depth(state.u.uz, state) > 2 ? 2 : 3;
            for (let pass = 1; pass <= maxPass; ++pass) {
                const candidate = mkobj(objectClass, false, env);
                if (state.objects[obj.otyp].oc_level
                    <= state.objects[candidate.otyp].oc_level) {
                    dealloc_obj(candidate, env);
                } else {
                    dealloc_obj(obj, env);
                    obj = candidate;
                }
            }
        }
        add_to_container(chest, obj, env);
    }

    chest.owt = weight(chest, env);
    return chest;
}

// C ref: mklev.c fill_ordinary_room(). makelevel() waits for it: the room's
// monster, or the donor monster of a random statue trap (trap.c
// mk_trap_statue()), can be a new shapechanger whose first newcham()
// prompts under the wizard-mode mon_polycontrol option, and C fills the
// rest of the room after the answer. Its impossible() reports, and
// dungeon.c builds_up()'s through level_difficulty(), print where C prints
// them.
export function fill_ordinary_room(croom, bonusItems) {
    return finish_steps(fill_ordinary_room_steps(croom, bonusItems),
        impossible_printer(game), game);
}

function* fill_ordinary_room_steps(croom, bonusItems) {
    const state = game;
    if (!croom || (croom.rtype !== OROOM && croom.rtype !== THEMEROOM))
        return;

    // The subrooms are filled first, so that an outer room left unfilled
    // does not block a filled inner one.
    const subrooms = croom.sbrooms ?? [];
    const subroomCount = croom.nsubrooms ?? subrooms.length;
    for (let index = 0; index < subroomCount; ++index) {
        const subroom = subrooms[index];
        if (!subroom) {
            yield new ImpossibleCall('fill_ordinary_room: Null subroom');
            return;
        }
        yield* fill_ordinary_room_steps(subroom, false);
    }

    if (croom.needfill !== FILL_NORMAL) return;

    const env = levelObjectEnv({
        hooks: { bydoor, somexyspace },
    });
    const position = { x: 0, y: 0 };
    let tryCount = 0;

    // A sleeping monster, and a web under a giant spider.
    if ((state.u.uhave.amulet || !rn2(3))
        && somexyspace(croom, position, { state })) {
        const monster = yield makemon(
            null, position.x, position.y, MM_NOGRP, env);
        if (monster?.data === state.mons[PM_GIANT_SPIDER]
            && !occupied(position.x, position.y, state)) {
            yield maketrap(position.x, position.y, WEB, env);
        }
    }

    // Traps and mimics.
    let chance = 8 - Math.trunc((yield* level_difficulty_steps(state)) / 6);
    if (chance <= 1) chance = 2;
    while (!rn2(chance) && ++tryCount < 1000) {
        yield make_level_trap(0, MKTRAP_NOFLAGS, croom, null, env);
    }

    if (!rn2(3) && somexyspace(croom, position, { state }))
        mkgold(0, position.x, position.y, env);

    if (!on_level(state.u.uz, state.rogue_level)) {
        if (!rn2(10)) mkfount(croom, env);
        if (!rn2(60)) mksink(croom, env);
        if (!rn2(60)) mkaltar(croom, env);

        chance = 80 - depth(state.u.uz, state) * 2;
        if (chance < 2) chance = 2;
        if (!rn2(chance)) mkgrave(croom, env);

        if (!rn2(20) && somexyspace(croom, position, { state })) {
            mkcorpstat(
                STATUE,
                null,
                null,
                position.x,
                position.y,
                CORPSTAT_INIT,
                env,
            );
        }

        let skipChests = false;
        if (bonusItems && somexyspace(croom, position, { state })) {
            const branch = is_branchlev();
            if (isMinesEntrance(branch, state)) {
                const food = rn2(5) < 3
                    ? FOOD_RATION
                    : rn2(2) ? CRAM_RATION : LEMBAS_WAFER;
                mksobj_at(
                    food,
                    position.x,
                    position.y,
                    true,
                    false,
                    env,
                );
            } else if (state.oracle_level
                && state.u.uz.dnum === state.oracle_level.dnum
                && state.u.uz.dlevel < state.oracle_level.dlevel
                && rn2(3)) {
                fill_ordinary_room_supply_chest(position, env);
                skipChests = true;
            }
        }

        const chestBound = Math.trunc(state.level.nroom * 5 / 2);
        if (!skipChests && !rn2(chestBound)
            && somexyspace(croom, position, { state })) {
            mksobj_at(
                rn2(3) ? LARGE_BOX : CHEST,
                position.x,
                position.y,
                true,
                false,
                env,
            );
        }

        if (!rn2(27 + 3 * Math.abs(depth(state.u.uz, state)))) {
            const engraving = random_engraving({ state });
            if (engraving.text) {
                do {
                    somexyspace(croom, position, { state });
                } while (state.level.at(position.x, position.y).typ !== ROOM
                    && !rn2(40));
                if (state.level.at(position.x, position.y).typ === ROOM) {
                    make_engr_at(
                        position.x,
                        position.y,
                        engraving.text,
                        engraving.pristine,
                        0,
                        MARK, { state },
                    );
                }
            }
        }
    }

    if (!rn2(3) && somexyspace(croom, position, { state })) {
        mkobj_at(
            RANDOM_CLASS,
            position.x,
            position.y,
            true,
            env,
        );
        tryCount = 0;
        while (!rn2(5)) {
            if (++tryCount > 100) {
                yield new ImpossibleCall('trycnt overflow4');
                break;
            }
            if (somexyspace(croom, position, { state })) {
                mkobj_at(
                    RANDOM_CLASS,
                    position.x,
                    position.y,
                    true,
                    env,
                );
            }
        }
    }
}

// ============================================================
// Level finalize topology
// ============================================================

export function level_finalize_topology() {
    bound_digging();
    mineralize(-1, -1, -1, -1, false, { state: game });
    game.in_mklev = false;
    // mklev.c:level_finalize_topology() clears the Lua coordinate origin after
    // post-level callbacks because xstart/ystart are not persisted with a
    // level.  Later special-level operations must start from the zero frame.
    game.xstart = 0;
    game.ystart = 0;
    // mklev.c keeps graveyard active after entering one and promotes it when
    // level generation found a morgue. Do not clear an earlier graveyard.
    if (game.level.flags.has_morgue)
        game.level.flags.graveyard = true;
    if (!game.level?.flags?.is_maze_lev) {
        const nroom = game.level?.nroom ?? 0;
        for (let i = 0; i < nroom; i++)
            topologize(game.level.rooms?.[i]);
    }
    set_wall_state();
    // C's loop covers SIZE(svr.rooms), whose second half holds the
    // subrooms; JS keeps those in game.subrooms. The Oracle's Delphi is a
    // subroom, and its orig_rtype feeds the #overview annotation.
    for (const rm of [...(game.level?.rooms ?? []), ...(game.subrooms ?? [])]) {
        if (rm && rm.rtype != null) rm.orig_rtype = rm.rtype;
    }
}
