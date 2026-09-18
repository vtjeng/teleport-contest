// Hero inventory and nobj-chain primitives.
// C refs: src/invent.c addinv(), mergable(), merged(), nxtobj(), useupall();
//         src/mkobj.c add_to_container() and add_to_buried().

import { calc_capacity, inv_cnt, near_capacity } from './hack.js';
import {
    ACH_AMUL,
    ACH_BELL,
    ACH_BOOK,
    ACH_CNDL,
    ACH_MINE_PRIZE,
    ACH_SOKO_PRIZE,
    A_CHAOTIC,
    A_LAWFUL,
    A_NEUTRAL,
    A_NONE,
    BLINDED,
    BUC_BLESSED,
    BUC_CURSED,
    BUC_UNCURSED,
    BUC_UNKNOWN,
    BUFSZ,
    CMDQ_INT,
    CMDQ_KEY,
    CMDQ_USER_INPUT,
    CONTAINED_SYM,
    COST_NOCONTENTS,
    CQ_CANNED,
    CQ_REPEAT,
    INVORDER_SORT,
    SIGNAL_ESCAPE,
    SIGNAL_NOMENU,
    USE_INVLET,
    ECMD_OK,
    ECMD_CANCEL,
    ECMD_FAIL,
    FINGERTIP,
    FUMBLING,
    GOLD_SYM,
    HAND,
    HALLUC,
    HALLUC_RES,
    engulfing_u,
    LEFT_HANDED,
    LEFT_RING,
    RIGHT_RING,
    LOST_EXPLODING,
    LOST_NONE,
    LOST_THROWN,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_DELETED,
    OBJ_FLOOR,
    OBJ_FREE,
    OBJ_INVENT,
    OBJ_LUAFREE,
    OBJ_MIGRATING,
    OBJ_MINVENT,
    OBJ_ONBILL,
    NON_PM,
    DBWALL,
    D_BROKEN,
    D_ISOPEN,
    D_NODOOR,
    DRAWBRIDGE_DOWN,
    IRONBARS,
    IS_ALTAR,
    IS_DOOR,
    IS_FOUNTAIN,
    IS_GRAVE,
    IS_SINK,
    IS_THRONE,
    TREE,
    P_BOW,
    P_CROSSBOW,
    P_DAGGER,
    P_KNIFE,
    P_SPEAR,
    SORTLOOT_INVLET,
    SORTLOOT_INUSE,
    SORTLOOT_LOOT,
    SORTLOOT_PACK,
    SORTLOOT_PETRIFY,
    is_pit,
    Is_airlevel,
    Is_waterlevel,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    LOOKHERE_SKIP_DFEATURE,
    MSGTYP_MASK_REP_SHOW,
    GETOBJ_ALLOWCNT,
    GETOBJ_NOFLAGS,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_EXCLUDE_NONINVENT,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    GC_SAVEHIST,
    HANDS_SYM,
    LARGEST_INT,
    MENU_TRADITIONAL,
    MENU_FULL,
    MENU_PARTIAL,
    UNPAID_TYPES,
    BILLED_TYPES,
    INCLUDE_VENOM,
    JUSTPICKED,
    Never_mind,
    quitchars,
    silly_thing_to,
    STONE_RES,
    PLNMSG_ONE_ITEM_HERE,
    CXN_ARTICLE,
    CXN_PFX_THE,
    AM_SANCTUM,
    AM_SHRINE,
    Amask2align,
    PICK_ANY,
    PICK_NONE,
    PICK_ONE,
    MINV_PICKMASK,
    MINV_ALL,
    plur,
    P_SABER,
    P_SHORT_SWORD,
    Upolyd,
    u_at,
    W_ART,
    W_ACCESSORY,
    W_ARMOR,
    W_QUIVER,
    W_SADDLE,
    W_TOOL,
    W_SWAPWEP,
    W_WEAPONS,
    W_WEP,
    WORN_AMUL,
    WORN_ARMOR,
    WORN_BLINDF,
    WORN_BOOTS,
    WORN_CLOAK,
    WORN_GLOVES,
    WORN_HELMET,
    WORN_SHIELD,
    WORN_SHIRT,
    STOMACH,
    INV_IN_USE,
    INV_SHOW_GOLD,
    LL_CONDUCT,
    WIN_ERR,
    WC_PERM_INVENT,
    ALL_FINISHED,
} from './const.js';
import {
    ART_MJOLLNIR, confers_luck, discover_artifact, set_artifact_intrinsic,
    touch_artifact,
} from './artifacts.js';
import { obj_resists } from './bury.js';
import {
    cmdq_add_int, cmdq_add_key, cmdq_clear, cmdq_pop, get_count, readchar,
    yn_function,
} from './cmd.js';
import { food_disappears } from './eat.js';
import { makeplural } from './fruit.js';
import { digit, ing_suffix, letter, s_suffix, visctrl } from './hacklib.js';
import {
    LOW_PM,
    PM_ARCHEOLOGIST,
    PM_CLERIC,
} from './monsters.js';
import { discover_object, observe_object } from './o_init.js';
import { body_part, mbodypart } from './polyself.js';
import {
    displayPendingTtyMessageWindow,
    ttyPline,
    tty_message_menu,
} from './tty_message.js';
import { menuTitleStyle } from './tty_menu.js';
import { tty_wait_synch } from './tty_rawprint.js';
import {
    CMAP_EXPLANATIONS,
    DEFAULT_PRIMARY_SYMBOLS,
    SYM_OFF_O,
} from './symbol_data.js';
import {
    S_fountain,
    S_grave,
    S_lava,
    S_ndoor,
    S_sink,
    S_throne,
    S_tree,
    S_vcdbridge,
    S_vcdoor,
    S_vodbridge,
    S_vodoor,
} from './symbols.js';
import { hides_under, poly_when_stoned, touch_petrifies } from './mondata.js';
import { maybe_unhide_at } from './mon.js';
import { newsym, obj_to_glyph } from './display.js';
import { livelog_printf } from './pline.js';
import { fingers_or_gloves } from './do_wear.js';
import { visible_region_at } from './region.js';
import { stairs_description, stairway_at } from './stairs.js';
import { is_drawbridge_wall } from './dbridge.js';
import { is_ice } from './terrain.js';
import { is_lava, is_pool, t_at, trapname } from './trap.js';
import { hidden_gold } from './vault.js';
import { game } from './gstate.js';
import { itemactions } from './iactions.js';
import { surface } from './dungeon.js';
import { ice_descr } from './pager.js';
import { can_reach_floor } from './engrave.js';
import { force_decor } from './pickup.js';
import { hide_unhide_msgtypes } from './options.js';
import { displayTtyMenuTextWindow } from './tty_menu.js';
import { add_menu_heading, getlin, select_menu } from './windows.js';
import { def_char_to_objclass } from './drawing.js';
import { rn2, rn2_on_display_rng } from './rng.js';
import {
    AMULET_OF_YENDOR,
    AKLYS,
    AMULET_CLASS,
    ARMOR_CLASS,
    BAG_OF_TRICKS,
    BELL_OF_OPENING,
    BUGLE,
    BOULDER,
    CANDELABRUM_OF_INVOCATION,
    COIN_CLASS,
    CORPSE,
    CRYSKNIFE,
    DRUM_OF_EARTHQUAKE,
    EGG,
    FIRE_HORN,
    FIGURINE,
    FOOD_CLASS,
    FROST_HORN,
    GEM_CLASS,
    GEMSTONE,
    GOLD_PIECE,
    GLASS,
    HORN_OF_PLENTY,
    LEASH,
    LEATHER_DRUM,
    LOADSTONE,
    LUCKSTONE,
    MAGIC_FLUTE,
    MAGIC_HARP,
    OBJ_DESCR,
    PIERCE,
    POT_OIL,
    POTION_CLASS,
    POT_WATER,
    ROCK,
    RING_CLASS,
    SCR_BLANK_PAPER,
    SCR_MAIL,
    SCR_SCARE_MONSTER,
    SCROLL_CLASS,
    SLIME_MOLD,
    SPE_BOOK_OF_THE_DEAD,
    SPE_NOVEL,
    SPBOOK_CLASS,
    STATUE,
    TIN,
    TOOLED_HORN,
    TOWEL,
    TOOL_CLASS,
    VENOM_CLASS,
    WAR_HAMMER,
    WEAPON_CLASS,
    FAKE_AMULET_OF_YENDOR,
    WOODEN_FLUTE,
    WOODEN_HARP,
} from './objects.js';
import {
    UnsupportedObjectOperationError,
    curseFreeObject,
    clear_splitobjs,
    dealloc_obj,
    erosionMatters,
    extract_nobj,
    greatest_erosion,
    hasContents,
    isCandle,
    isContainer,
    isPudding,
    is_ammo,
    is_missile,
    is_spear,
    is_wet_towel,
    is_gloves,
    objectType,
    place_object,
    preflightWeight,
    set_bknown,
    sobj_at as object_sobj_at,
    splitobj,
    unsplitobj,
    carried,
    unknwn_contnr_contents,
    weight,
} from './obj.js';
import { get_obj_location } from './light.js';
import {
    an,
    assertObjectNameable,
    assertPricedObjectNameable,
    cxname,
    donameFresh,
    doname_with_price,
    distant_name,
    not_fully_identified,
    safe_qbuf,
    vtense,
    xnameFresh,
    ansimpleoname,
    yname,
    corpse_xname,
} from './objnam.js';
import { mon_nam, noit_Monnam } from './do_name.js';
import { in_rooms } from './rooms.js';
import { ILLOBJ_CLASS, MAXOCLASSES } from './objects.js';
import { is_quest_artifact } from './questpgr.js';
import { note_unported } from './unported.js';
import { record_achievement } from './insight.js';
import {
    inhishop,
    inside_shop,
    same_price,
    shop_keeper,
    shop_debt,
    check_unpaid,
    unpaid_cost,
    costly_spot,
    addtobill,
    obfree_shop_bill,
    picked_container,
} from './shk.js';
import { set_moreluck } from './attrib.js';
import { is_pole } from './worn.js';
import { welded } from './wield.js';

// invent.c owns reroll_menu(); the startup module holds its complete menu
// implementation so the startup dependency graph stays acyclic. Re-export
// the source-named entry point from this file for inventory callers/tests.
export { reroll_menu } from './startup_reroll.js';

export const INVLET_BASIC = 52;
export const NOINVSYM = '#';

// C ref: invent.c nxtobj() (1477-1491). Start after `obj` and follow either
// the ownership chain or the floor-pile chain until the requested type.
export function nxtobj(obj, type, by_nexthere) {
    let current = obj;
    do {
        current = by_nexthere ? current.nexthere : current.nobj;
        if (!current) break;
    } while (current.otyp !== type);
    return current;
}

// Thrown where invent.c reads a terrain description this port has not reached
// yet. dfeature_at() is source-shaped for its admitted terrain cases, so every
// stop below names the C helper that is missing rather than the caller that hit it.
export class UnsupportedFeatureDescriptionError extends Error {
    constructor(helper) {
        super(`feature description requires ${helper}`);
        this.name = 'UnsupportedFeatureDescriptionError';
        this.helper = helper;
    }
}

function altarDeityName(alignment, state) {
    const name = alignment === A_LAWFUL ? state.urole?.lgod
        : alignment === A_NEUTRAL ? state.urole?.ngod
            : alignment === A_CHAOTIC ? state.urole?.cgod : 'Moloch';
    return String(name ?? 'someone').replace(/^_/u, '');
}

function alignmentName(alignment) {
    switch (alignment) {
    case A_CHAOTIC: return 'chaotic';
    case A_NEUTRAL: return 'neutral';
    case A_LAWFUL: return 'lawful';
    case A_NONE: return 'unaligned';
    default: return 'unknown';
    }
}

// C ref: invent.c dfeature_at(). Returns the description of the terrain
// feature at x,y, or null where C returns 0. C writes the same text into the
// caller's buffer; the JavaScript caller uses the return value alone.
export function dfeature_at(x, y, state = game) {
    const lev = state.level?.at(x, y);
    const ltyp = lev?.typ;
    let cmap = -1;
    let dfeature = null;

    if (IS_DOOR(ltyp)) {
        // Every other reader in the port takes flags first; both fields
        // stand for C's single doormask, and this one had them reversed.
        switch (lev.flags || lev.doormask || 0) {
        case D_NODOOR:
            cmap = S_ndoor;
            break;
        case D_ISOPEN:
            cmap = S_vodoor;
            break;
        case D_BROKEN:
            dfeature = 'broken door';
            break;
        default:
            cmap = S_vcdoor;
            break;
        }
        /* override door description for open drawbridge */
        if (is_drawbridge_wall(x, y, state) >= 0) {
            dfeature = 'open drawbridge portcullis';
            cmap = -1;
        }
    } else if (IS_FOUNTAIN(ltyp)) {
        cmap = S_fountain;
    } else if (IS_THRONE(ltyp)) {
        cmap = S_throne;
    } else if (is_lava(x, y, state)) {
        cmap = S_lava;
    } else if (is_ice(x, y, state)) {
        dfeature = ice_descr(x, y, state);
    } else if (is_pool(x, y, state)) {
        dfeature = 'pool of water';
    } else if (IS_SINK(ltyp)) {
        cmap = S_sink;
    } else if (IS_ALTAR(ltyp)) {
        const altarAlignment = Amask2align(
            (lev.altarmask ?? 0) & ~AM_SHRINE,
        );
        dfeature = `${(lev.altarmask & AM_SANCTUM) ? 'high ' : ''}altar to `
            + `${altarDeityName(altarAlignment, state)} (${alignmentName(
                altarAlignment,
            )})`;
    } else if (stairway_at(x, y, state)) {
        dfeature = stairs_description(stairway_at(x, y, state), true, state);
    } else if (ltyp === DRAWBRIDGE_DOWN) {
        cmap = S_vodbridge;
    } else if (ltyp === DBWALL) {
        cmap = S_vcdbridge;
    } else if (IS_GRAVE(ltyp)) {
        cmap = S_grave;
    } else if (ltyp === TREE) {
        cmap = S_tree;
    } else if (ltyp === IRONBARS) {
        dfeature = 'set of iron bars';
    }

    if (cmap >= 0) dfeature = CMAP_EXPLANATIONS[cmap];
    return dfeature || null;
}

// C ref: invent.c names[]. Indexed by object class.
const CLASS_NAMES = Object.freeze([
    null, 'Illegal objects', 'Weapons', 'Armor', 'Rings', 'Amulets', 'Tools',
    'Comestibles', 'Potions', 'Scrolls', 'Spellbooks', 'Wands', 'Coins',
    'Gems/Stones', 'Boulders/Statues', 'Iron balls', 'Chains', 'Venoms',
]);

// C ref: invent.c let_to_name(). Converts an object class or the contained
// item pseudo-class to the heading used by inventory and billing menus.
export function let_to_name(letter, unpaid, showsym) {
    // C's parameter is named `let`, which JavaScript reserves.
    const oclass = (letter >= 1 && letter < MAXOCLASSES) ? letter : 0;
    const class_name = letter === CONTAINED_SYM ? 'Bagged/Boxed items'
        : CLASS_NAMES[oclass] ?? CLASS_NAMES[ILLOBJ_CLASS];
    const prefix = unpaid ? 'Unpaid ' : '';
    if (!oclass || !showsym)
        return `${prefix}${class_name}`;
    // The loop pads short names through byte column seven, then ocsymfmt
    // contributes two more spaces and the quoted compiled-in class symbol.
    const padded = class_name.padEnd(7, ' ');
    const symbol = String.fromCharCode(
        DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + oclass],
    );
    return `${prefix}${padded}  ('${symbol}')`;
}

// C ref: invent.c free_invbuf(). JavaScript returns immutable strings from
// let_to_name(), so there is no heap buffer to release; retaining this named
// boundary keeps save.c's cleanup caller source-visible.
export function free_invbuf() {
    return undefined;
}

// C ref: invent.c hands_obj. getobj() returns this shared sentinel when the
// player deliberately selects hands/self; null remains the cancellation and
// invalid-answer result. Callers compare its identity and must not inspect it
// as an ordinary object.
export const hands_obj = Object.freeze({});

// C ref: invent.c inuse_classify() (70-144). Classifies an object for the
// in-use inventory display. The C function writes these four fields into its
// Loot argument; JavaScript keeps the same fields on each sort item.
function inuse_classify(sort_item, obj, state = game) {
    const w_mask = (obj.owornmask ?? 0)
        & (W_ACCESSORY | W_WEAPONS | W_ARMOR);
    let rating = 0;
    let altclass = 0;
    const useRating = (test) => {
        ++rating;
        return Boolean(test);
    };

    ++altclass;
    if (useRating(!w_mask && obj.otyp === LEASH && obj.leashmon))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(!w_mask && obj.oclass === TOOL_CLASS && obj.lamplit))
        return assignInuseRating(sort_item, rating, altclass);

    ++altclass;
    if (useRating(w_mask & WORN_SHIRT))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & WORN_BOOTS))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & WORN_GLOVES))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & WORN_HELMET))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & WORN_SHIELD))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & WORN_CLOAK))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & WORN_ARMOR))
        return assignInuseRating(sort_item, rating, altclass);

    ++altclass;
    if (useRating(w_mask & W_QUIVER))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & W_SWAPWEP))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & W_WEP))
        return assignInuseRating(sort_item, rating, altclass);

    ++altclass;
    if (useRating(w_mask & WORN_BLINDF))
        return assignInuseRating(sort_item, rating, altclass);
    const lefty = state.u?.uhandedness === LEFT_HANDED;
    if (useRating(w_mask & (lefty ? RIGHT_RING : LEFT_RING)))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & (lefty ? LEFT_RING : RIGHT_RING)))
        return assignInuseRating(sort_item, rating, altclass);
    if (useRating(w_mask & WORN_AMUL))
        return assignInuseRating(sort_item, rating, altclass);

    assignInuseRating(sort_item, 0, -1);
}

function assignInuseRating(sort_item, rating, altclass) {
    sort_item.inuse = rating;
    sort_item.orderclass = altclass;
    sort_item.subclass = 0;
    sort_item.disco = 0;
}

// C ref: invent.c loot_classify() (149-305). Writes class, subclass,
// discovery and in-use ordering fields into a Loot item.
const ARMCAT = [7, 4, 1, 2, 3, 5, 6, 8];
const DEF_SRT_ORDER = '\x0B\x04\x05\x06\x08\x09\x0A\x0C\x07\x0D\x02\x03\x0F\x10\x11';

function loot_classify(sort_item, obj, state = game) {
    const objects = state.objects;
    const otyp = obj.otyp;
    const oclass = obj.oclass;
    const type = objectType(obj, state);
    const discovered = Boolean(objects[otyp].oc_name_known);
    if (!heroIsBlind(state)) observe_object(obj, state);
    const seen = Boolean(obj.dknown);
    const classorder = state.flags?.sortpack
        ? (state.flags.inv_order ?? DEF_SRT_ORDER)
        : DEF_SRT_ORDER;
    let p = -1;
    for (let i = 0; i < classorder.length; ++i) {
        const value = typeof classorder[i] === 'string'
            ? classorder[i].charCodeAt(0) : classorder[i];
        if (value === oclass) {
            p = i;
            break;
        }
    }
    let k = p >= 0
        ? 1 + p
        : 1 + classorder.length + (oclass !== VENOM_CLASS ? 1 : 0);
    sort_item.orderclass = k;

    switch (oclass) {
    case ARMOR_CLASS:
        k = type.oc_armcat;
        if (k < 0 || k >= 7) k = 7;
        k = ARMCAT[k];
        break;
    case WEAPON_CLASS: {
        k = type.oc_skill;
        k = k < 0
            ? ((k >= -P_CROSSBOW && k <= -P_BOW) ? 1 : 3)
            : ((k >= P_BOW && k <= P_CROSSBOW) ? 2
                : (k === P_SPEAR || k === P_DAGGER || k === P_KNIFE) ? 4
                    : !is_pole(obj, state) ? 5 : 6);
        break;
    }
    case TOOL_CLASS:
        if (seen && discovered
            && (otyp === BAG_OF_TRICKS || otyp === HORN_OF_PLENTY)) {
            k = 2;
        } else if (isContainer(obj)) {
            k = 1;
        } else {
            switch (otyp) {
            case WOODEN_FLUTE:
            case MAGIC_FLUTE:
            case TOOLED_HORN:
            case FROST_HORN:
            case FIRE_HORN:
            case WOODEN_HARP:
            case MAGIC_HARP:
            case BUGLE:
            case LEATHER_DRUM:
            case DRUM_OF_EARTHQUAKE:
            case HORN_OF_PLENTY:
                k = 3;
                break;
            default:
                k = 4;
                break;
            }
        }
        break;
    case FOOD_CLASS:
        switch (otyp) {
        case SLIME_MOLD: k = 1; break;
        default: k = obj.globby ? 6 : 2; break;
        case TIN: k = 3; break;
        case EGG: k = 4; break;
        case CORPSE: k = 5; break;
        }
        break;
    case GEM_CLASS:
        switch (type.oc_material) {
        case GEMSTONE: k = !seen ? 1 : !discovered ? 2 : 3; break;
        case GLASS: k = !seen ? 1 : !discovered ? 2 : 4; break;
        default:
            k = !seen ? 5
                : (otyp !== ROCK) ? (!discovered ? 6 : 7) : 8;
            break;
        }
        break;
    default:
        k = 1;
        break;
    }
    sort_item.subclass = k;
    k = !seen ? 1
        : (discovered || OBJ_DESCR(type, state) == null) ? 4
            : type.oc_uname ? 3 : 2;
    sort_item.disco = k;
    sort_item.inuse = 0;
}

// C ref: invent.c loot_xname() (309-387). Temporarily removes attributes
// that sortloot_cmp() compares separately before formatting a singular name.
function loot_xname(obj, state = game) {
    const saveo = {
        odiluted: obj.odiluted,
        blessed: obj.blessed,
        cursed: obj.cursed,
        spe: obj.spe,
        owt: obj.owt,
        quan: obj.quan,
    };
    const saveOname = obj.oextra?.oname ?? null;
    const saveDebug = Boolean(state.flags?.debug);
    if (obj.oclass === POTION_CLASS) {
        obj.odiluted = 0;
        if (obj.otyp === POT_WATER) {
            obj.blessed = 0;
            obj.cursed = 0;
        }
    }
    if (obj.otyp === TOWEL) obj.spe = 0;
    if (obj.globby) obj.owt = 20;
    obj.quan = 1;
    if (saveOname && !obj.oartifact && obj.oextra)
        obj.oextra.oname = null;
    if (state.wizard) {
        state.program_state ??= {};
        state.program_state.something_worth_saving = 0;
        state.flags.debug = false;
    }

    let result;
    try {
        result = cxname(obj, state);
    } finally {
        if (saveDebug) {
            state.flags.debug = true;
            state.program_state ??= {};
            state.program_state.something_worth_saving = 1;
        }
        if (obj.oclass === POTION_CLASS) {
            obj.odiluted = saveo.odiluted;
            if (obj.otyp === POT_WATER) {
                obj.blessed = saveo.blessed;
                obj.cursed = saveo.cursed;
            }
        }
        if (obj.otyp === TOWEL) obj.spe = saveo.spe;
        if (obj.globby) obj.owt = saveo.owt;
        obj.quan = saveo.quan;
        if (saveOname && !obj.oartifact && obj.oextra)
            obj.oextra.oname = saveOname;
    }
    if (obj.otyp === TOWEL)
        result += is_wet_towel(obj) ? (obj.spe >= 3 ? 'x' : 'y') : 'z';
    if (obj.globby)
        result += obj.owt <= 100 ? 'a'
            : obj.owt <= 300 ? 'b' : obj.owt <= 500 ? 'c' : 'd';
    return result;
}

// C ref: invent.c invletter_value() (391-399). Orders '$', lower-case,
// upper-case, '#', then every other character.
function invletter_value(c) {
    if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 96 + 1;
    if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 64 + 26 + 1;
    if (c === '$') return 1;
    if (c === NOINVSYM) return INVLET_BASIC + 2;
    return INVLET_BASIC + 3;
}

// C ref: invent.c sortloot_cmp() (403-547). Compares two Loot entries in
// source order, preserving the original index for equal entries.
function sortloot_cmp(sli1, sli2, mode, state = game) {
    if (mode & SORTLOOT_INUSE) {
        if (!sli1.orderclass) inuse_classify(sli1, sli1.obj, state);
        if (!sli2.orderclass) inuse_classify(sli2, sli2.obj, state);
        if (sli1.inuse !== sli2.inuse) return sli2.inuse - sli1.inuse;
        return sli1.indx - sli2.indx;
    }
    if ((mode & (SORTLOOT_PACK | SORTLOOT_INVLET)) !== SORTLOOT_INVLET) {
        if (!sli1.orderclass) loot_classify(sli1, sli1.obj, state);
        if (!sli2.orderclass) loot_classify(sli2, sli2.obj, state);
        if (sli1.orderclass !== sli2.orderclass)
            return sli1.orderclass - sli2.orderclass;
        if (!(mode & SORTLOOT_INVLET)) {
            if (sli1.subclass !== sli2.subclass)
                return sli1.subclass - sli2.subclass;
            if (sli1.disco !== sli2.disco)
                return sli1.disco - sli2.disco;
        }
    }
    if (mode & SORTLOOT_INVLET) {
        const val1 = invletter_value(sli1.obj.invlet);
        const val2 = invletter_value(sli2.obj.invlet);
        if (val1 !== val2) return val1 - val2;
    }
    if (!(mode & SORTLOOT_LOOT)) return sli1.indx - sli2.indx;
    if (!sli1.str) sli1.str = loot_xname(sli1.obj, state);
    if (!sli2.str) sli2.str = loot_xname(sli2.obj, state);
    const name1 = sli1.str.toLowerCase();
    const name2 = sli2.str.toLowerCase();
    if (name1 < name2) return -1;
    if (name1 > name2) return 1;

    const buc = (obj) => obj.bknown
        ? (obj.blessed ? 3 : !obj.cursed ? 2 : 1) : 0;
    const buc1 = buc(sli1.obj), buc2 = buc(sli2.obj);
    if (buc1 !== buc2) return buc2 - buc1;
    const greased1 = sli1.obj.greased ? 1 : 0;
    const greased2 = sli2.obj.greased ? 1 : 0;
    if (greased1 !== greased2) return greased2 - greased1;
    const erosion1 = greatest_erosion(sli1.obj);
    const erosion2 = greatest_erosion(sli2.obj);
    if (erosion1 !== erosion2) return erosion1 - erosion2;
    const proof1 = sli1.obj.rknown && sli1.obj.oerodeproof ? 1 : 0;
    const proof2 = sli2.obj.rknown && sli2.obj.oerodeproof ? 1 : 0;
    if (proof1 !== proof2) return proof2 - proof1;
    const type1 = objectType(sli1.obj, state);
    if (type1.oc_uses_known && sli1.obj.oclass !== FOOD_CLASS) {
        const spe1 = sli1.obj.known ? sli1.obj.spe : -1000;
        const spe2 = sli2.obj.known ? sli2.obj.spe : -1000;
        if (spe1 !== spe2) return spe2 - spe1;
    }
    return sli1.indx - sli2.indx;
}

// C ref: invent.c sortloot() (593-646). Builds a temporary array in source
// list order, optionally augments the filter for petrifying corpses, and
// sorts that array without changing the linked list.
export function sortloot(olist, mode, by_nexthere, filterfunc, state = game) {
    const items = [];
    const augmentFilter = Boolean(mode & SORTLOOT_PETRIFY);
    const sortMode = mode & ~SORTLOOT_PETRIFY;
    let index = 0;
    for (let obj = olist; obj;
        obj = by_nexthere ? obj.nexthere : obj.nobj) {
        const accepted = !filterfunc || filterfunc(obj)
            || (augmentFilter && obj.otyp === CORPSE
                && touch_petrifies(state.mons?.[obj.corpsenm]));
        if (!accepted) continue;
        items.push({
            obj,
            str: null,
            indx: index,
            orderclass: 0,
            subclass: 0,
            disco: 0,
            inuse: 0,
        });
        ++index;
    }
    if (sortMode && items.length > 1) {
        items.sort((a, b) => sortloot_cmp(a, b, sortMode, state));
        // C frees comparator-owned name buffers before returning the array.
        for (const item of items) item.str = null;
    }
    return items;
}

// C ref: invent.c unsortloot() (647-654). JavaScript garbage-collects the
// temporary array, so callers replace their reference with this null result.
export function unsortloot(_loot_array) {
    return null;
}

// Inventory reassign() needs only the objects from the inventory-letter sort.
function sortlootByInvlet(state) {
    return sortloot(inventoryHead(state), SORTLOOT_INVLET, false, null, state)
        .map((entry) => entry.obj);
}

// C ref: invent.c's inactive 3.6.0 sortloot() definition (655-693). The
// preprocessor excludes this implementation with #if 0; production uses the
// temporary-array implementation above.

// C ref: invent.c compactify() (1626-1659). Rewrites a run of three or more
// consecutive letters in place as "<first>-<last>", so "bcdefg" becomes "b-g",
// and squeezes three or more '#' overflow letters into "#-#".
//
// `buf` is a NUL-terminated array of one-character strings, mirroring C's
// char buffer: the algorithm indexes past the position it is writing and
// depends on the terminator to stop.
function compactify(buf) {
    const successor = (c) => String.fromCharCode(c.charCodeAt(0) + 1);
    let i1 = 1;
    let i2 = 1;
    let ilet2 = buf[0];
    let ilet1 = buf[1];
    buf[++i2] = buf[++i1];
    let ilet = buf[i1];
    while (ilet !== '\0') {
        if (ilet === successor(ilet1)) {
            if (ilet1 === successor(ilet2)) {
                ilet1 = '-';
                buf[i2 - 1] = ilet1;
            } else if (ilet2 === '-') {
                ilet1 = successor(ilet1);
                buf[i2 - 1] = ilet1;
                buf[i2] = buf[++i1];
                ilet = buf[i1];
                continue;
            }
        } else if (ilet === NOINVSYM) {
            /* compact three or more consecutive '#' characters into "#-#" */
            if (i2 >= 2 && buf[i2 - 2] === NOINVSYM
                && buf[i2 - 1] === NOINVSYM) {
                buf[i2 - 1] = '-';
            } else if (i2 >= 3 && buf[i2 - 3] === NOINVSYM
                       && buf[i2 - 2] === '-' && buf[i2 - 1] === NOINVSYM) {
                --i2;
            }
        }
        ilet2 = ilet1;
        ilet1 = ilet;
        buf[++i2] = buf[++i1];
        ilet = buf[i1];
    }
    buf.length = buf.indexOf('\0') + 1;
}

// C ref: invent.c any_obj_ok() (1709-1715), the getobj() callback for the `d`
// command: every carried object is a likely candidate, and the hands/self
// choice is not one.
export function any_obj_ok(obj) {
    if (obj)
        return GETOBJ_SUGGEST;
    return GETOBJ_EXCLUDE;
}

// C ref: invent.c getobj_hands_txt() (1717-1736). Returns a string describing
// the hero's hands based on the action word, for display_pickinv()'s
// xtra_choice parameter when the hands/self option appears in the menu.
function getobj_hands_txt(action, state) {
    if (action === 'grease') {
        return `your ${fingers_or_gloves(false, state)}`;
    } else if (action === 'write with') {
        return `your ${body_part(FINGERTIP, state.youmonst)}`;
    } else if (action === 'wield') {
        return `your ${state.uarmg ? 'gloved' : 'bare'} `
            + `${makeplural(body_part(HAND, state.youmonst))}`
            + `${!state.uwep ? ' (wielded)' : ''}`;
    } else if (action === 'ready') {
        return `empty quiver${!state.uquiver ? ' (nothing readied)' : ''}`;
    } else {
        return `your ${makeplural(body_part(HAND, state.youmonst))}`;
    }
}

// C ref: invent.c splittable() (1664-1671). A welded weapon and a cursed
// loadstone must remain one object when a count is applied to the stack.
function splittable(obj, state = game) {
    return !((obj.otyp === LOADSTONE && obj.cursed)
        || (obj === state.uwep && welded(obj, state)));
}

// C ref: invent.c taking_off() (1672-1677).
function taking_off(action) {
    return action === 'take off' || action === 'remove';
}

// C ref: invent.c mime_action() (1678-1709). The C routine builds the
// present-participle of the action and optionally chooses one of two object
// prepositions. `ttyPline` is asynchronous in this port, so callers await
// this otherwise direct translation.
async function mime_action(action, state = game) {
    let buf = String(action);
    let sfx = '';
    let pfx = '';
    const onThe = buf.indexOf(' on the ');
    if (onThe >= 0) {
        // C replaces the separator by NUL and keeps the remainder beginning
        // at the separator's space: "on the ...".
        sfx = buf.slice(onThe + 1);
        buf = buf.slice(0, onThe);
    }
    if ((buf.startsWith('rub the ') && buf.slice(8).includes(' on'))
        || (buf.startsWith('dip ') && buf.slice(4).includes(' into'))) {
        // C's buf[3] = '\0'; pfx = &buf[4], leaving the verb in buf.
        pfx = buf.slice(4);
        buf = buf.slice(0, 3);
    }
    let bp = buf.indexOf(' or ');
    if (bp >= 0) {
        const first = buf.slice(0, bp);
        const second = buf.slice(bp + 4);
        buf = rn2(2) ? first : second;
    }
    const pfxText = pfx ? ` ${pfx}` : '';
    const sfxText = sfx ? ` ${sfx}` : '';
    await ttyPline(
        `You mime ${ing_suffix(buf)}${pfxText} something${sfxText}.`,
        state,
    );
}

// C ref: invent.c getobj() (1751-2088). Answers the object the player chose,
// null where C returns 0, and hands_obj where C returns &hands_obj.
//
// Every `obj_ok` answer below is awaited. do_wear.c equip_ok() reaches
// canwearobj(), whose refusals write messages, so equip_ok() is async and both
// callbacks over it -- wear_ok() and takeoff_ok() -- return promises.
// any_obj_ok() above, apply_ok() and eat_ok() are still plain functions, so the
// await is what lets one set of call sites serve both kinds.
//
// The command queue, repeat reader, count reader, inventory reassigner, and
// forced inventory menu are all live here. Itemactions queues a command
// followed by the selected object's inventory letter, so the CMDQ_KEY lookup
// arm is live too.
//
// GETOBJ_PROMPT does not stop: its only effect is the `forceprompt` term that
// steers the "You don't have anything to <foo>." return below. GETOBJ_ALLOWCNT
// does not stop on arrival either. C reads it for queued counts, typed digits,
// and counts returned by an inventory menu.
export async function getobj(word, obj_ok, ctrlflags, state = game) {
    const allowcnt = (ctrlflags & GETOBJ_ALLOWCNT) !== 0;
    let cnt = 0;
    let cntgiven = false;
    let queued = cmdq_pop(state);
    // C's CMDQ_USER_INPUT marker means that this prompt reads a fresh object
    // selection while later canned answers remain in the queue.
    if (queued?.typ === CMDQ_USER_INPUT) queued = null;
    if (queued?.typ === CMDQ_INT) {
        if (!allowcnt) {
            cmdq_clear(CQ_CANNED, state);
            return null;
        }
        cnt = Math.trunc(queued.value ?? 0);
        cntgiven = true;
        queued = cmdq_pop(state);
        // C's `goto need_more_cq` falls through to the interactive prompt
        // when the count is not followed by a key node.  A user-input marker
        // has the same effect while preserving later canned input.
        if (queued?.typ === CMDQ_USER_INPUT) queued = null;
    }
    if (queued) {
        if (queued.typ === CMDQ_KEY) {
            const key = typeof queued.key === 'number'
                ? String.fromCharCode(queued.key) : queued.key;
            if (key === HANDS_SYM) {
                const suitability = await obj_ok(null, state);
                if (suitability === GETOBJ_SUGGEST
                    || suitability === GETOBJ_DOWNPLAY) {
                    return hands_obj;
                }
            } else {
                for (let item = inventoryHead(state); item; item = item.nobj) {
                    if (item.invlet !== key) continue;
                    const suitability = await obj_ok(item, state);
                    if (suitability === GETOBJ_SUGGEST
                        || suitability === GETOBJ_DOWNPLAY) {
                        if (cntgiven) {
                            // invent.c clears cntgiven for an invalid or
                            // complete queued count before split_otmp; that
                            // returns the original stack unchanged.
                            if (cnt < 1 || item.quan <= cnt) {
                                cntgiven = false;
                            } else {
                                if (splittable(item, state))
                                    return splitobj(item, cnt, { state });
                                if (item.otyp === LOADSTONE && item.cursed)
                                    item.corpsenm = cnt;
                            }
                        }
                        return item;
                    }
                }
            }
            // C invent.c getobj():1817-1818 discards the remaining canned
            // sequence when its queued letter does not name a suitable item.
            cmdq_clear(CQ_CANNED, state);
            return null;
        }
        cmdq_clear(CQ_CANNED, state);
        return null;
    }
    let otmp = null;
    let ilet = '';
    let oneloop = false;
    // C's bp starts at buf and the hands/self arm may advance it past a "- "
    // prefix; the letters it then collects are what `lets` copies and
    // compactify() rewrites, so the two halves are kept apart here.
    const prefix = [];
    const letters = [];
    const altlets = [];
    let forceprompt = (ctrlflags & GETOBJ_PROMPT) !== 0;
    let allownone = false;
    /* counts GETOBJ_EXCLUDE_INACCESS items to decide between "you don't have
     * anything to <foo>" versus "you don't have anything _else_ to <foo>"
     * (also used for GETOBJ_EXCLUDE_NONINVENT) */
    let inaccess = 0;

    /* is "hands"/"self" a valid thing to do this action on? */
    switch (await obj_ok(null, state)) {
    case GETOBJ_SUGGEST: /* treat as likely candidate */
        allownone = true;
        prefix.push(HANDS_SYM);
        prefix.push(' '); /* put a space after the '-' in the prompt */
        break;
    case GETOBJ_DOWNPLAY: /* acceptable but not shown as likely choice */
    case GETOBJ_EXCLUDE_INACCESS:
    case GETOBJ_EXCLUDE_SELECTABLE:
        allownone = true;
        altlets.push(HANDS_SYM);
        break;
    case GETOBJ_EXCLUDE_NONINVENT: /* player skipped some alternative that's
                                    * not in inventory, now the hands/self
                                    * possibility is telling us so */
        forceprompt = false;
        inaccess++;
        break;
    default:
        break;
    }

    if (!state.flags.invlet_constant)
        reassign(state);

    /* force invent to be in invlet order before collecting candidate
       inventory letters */
    for (const item of sortlootByInvlet(state)) {
        letters.push(item.invlet);
        switch (await obj_ok(item, state)) {
        case GETOBJ_EXCLUDE_INACCESS:
            /* remove inaccessible things */
            letters.pop();
            inaccess++;
            break;
        case GETOBJ_EXCLUDE:
        case GETOBJ_EXCLUDE_SELECTABLE:
            /* remove more inappropriate things, but unlike the first it won't
               trigger an "else" in "you don't have anything else to ___" */
            letters.pop();
            break;
        case GETOBJ_DOWNPLAY:
            /* acceptable but not listed as likely candidates in the prompt
               or in the inventory subset if player responds with '?' */
            letters.pop();
            forceprompt = true;
            altlets.push(item.invlet);
            break;
        case GETOBJ_SUGGEST:
            break; /* adding otmp->invlet is all that's needed */
        default:
            throw new Error('bad return from getobj callback');
        }
    }

    const suggested = letters.length;
    /* If no objects were suggested but we added '- ' at the beginning for
     * hands, destroy the trailing space */
    if (suggested === 0 && prefix.length && prefix[prefix.length - 1] === ' ')
        prefix.pop();
    // C's two letter subsets, kept here in the shape C builds them in. `lets`
    // is the suggested set snapshotted before compactify() rewrites `letters`,
    // and `altletsStr` below is the downplayed set. The redo_menu block below
    // passes `lets` to display_pickinv() for '?' and falls back to `altletsStr`
    // when `lets` is empty (C:1969-1970).
    const lets = letters.join(''); /* necessary since we destroy buf */
    if (suggested > 5) { /* compactify string */
        letters.push('\0');
        compactify(letters);
        letters.pop();
    }
    const buf = prefix.join('') + letters.join('');
    const altletsStr = altlets.join('');

    if (suggested === 0 && !forceprompt && !allownone) {
        await ttyPline(
            `You don't have anything ${inaccess ? 'else ' : ''}to ${word}.`,
            state,
        );
        return null;
    }
    for (;;) {
        cnt = 0;
        cntgiven = false;
        const qbuf = `What do you want to ${word}?`;
        if (state.in_doagain) {
            // C's repeat path reads the next raw answer with readchar(),
            // after the canned queue has been exhausted.
            ilet = String.fromCharCode(await readchar(state));
        } else if (state.iflags.force_invmenu) {
            ilet = oneloop ? '' : (lets || altletsStr ? '?' : '*');
            oneloop = true;
        } else {
            const prompt = qbuf + (buf ? ` [${buf} or ?*]` : ' [*]');
            ilet = String.fromCharCode(
                await yn_function(prompt, null, '\0', false, state),
            );
        }

        if (digit(ilet)) {
            if (!allowcnt) {
                await ttyPline('No count allowed with this command.', state);
                continue;
            }
            const countOut = { value: 0 };
            const counted = await get_count(
                null,
                ilet.charCodeAt(0),
                LARGEST_INT,
                countOut,
                GC_SAVEHIST,
                state,
            );
            ilet = String.fromCharCode(counted.key);
            if (countOut.value) {
                cnt = countOut.value;
                cntgiven = true;
            }
        }
        if (quitchars.includes(ilet)) {
            if (state.flags.verbose) await ttyPline(Never_mind, state);
            return null;
        }
        if (ilet === HANDS_SYM) { /* '-' */
            // C answers &hands_obj without mime_action() when the callback
            // admitted hands/self. Engraving is the first interactive caller
            // to do so; callers that exclude hands keep the older refusal.
            if (allownone) return hands_obj;
            await mime_action(word, state);
            return null;
        }
        // C ref: invent.c getobj() redo_menu (1960-2001). Unified handling
        // for '?' (suggested subset) and '*' (full inventory) menu requests.
        // C uses goto redo_menu when the player picks '?' or '*' inside the
        // menu; here a for(;;) loop replaces the goto.
        if (ilet === '?' || ilet === '*') {
            for (;;) {
                let allowed_choices = (ilet === '?') ? lets : null;
                let handsbuf = null;

                // C:1969-1970 -- fall back to altlets when lets is empty.
                if (ilet === '?' && !lets && altletsStr)
                    allowed_choices = altletsStr;

                // C clears qbuf before display_pickinv(). Forced menus use
                // the prompt as their menu query; the JS menu owner already
                // displays the same title through the enclosing prompt.
                const menuquery = null;

                // C:1976-1978 -- compute the hands description when the
                // full inventory is shown (allowed_choices is null), or
                // when the first entry is HANDS_SYM.
                if (!allowed_choices
                    || (allowed_choices.length && allowed_choices[0] === HANDS_SYM)
                    || (buf.length && buf[0] === HANDS_SYM))
                    handsbuf = getobj_hands_txt(word, state);

                const picked = await display_pickinv(
                    allowed_choices, handsbuf, menuquery,
                    allownone, true, state, { allowcnt },
                );
                if (!picked) {
                    // C:1983-1985 -- a forced menu is one-shot; an ordinary
                    // menu cancellation returns to the object prompt.
                    if (oneloop) return null;
                    break; // break inner, continue outer for(;;)
                }
                if (allowcnt && typeof picked === 'object'
                    && Object.hasOwn(picked, 'value')) {
                    if (picked.count >= 0) {
                        cnt = picked.count;
                        cntgiven = true;
                    }
                    ilet = picked.value;
                } else {
                    ilet = picked;
                }
                if (ilet === HANDS_SYM)
                    return hands_obj;
                if (ilet === '\x1b') {
                    if (state.flags.verbose) await ttyPline(Never_mind, state);
                    return null;
                }
                // C:1994-1995 -- goto redo_menu when the player picks
                // '?' or '*' inside the menu.
                if (ilet === '*' || ilet === '?') {
                    continue; // redo_menu
                }
                // C:1996-1999 -- display_pickinv() returns the selected
                // letter and, when allowcnt is set, its menu count.
                break;
            }
            // When the inner loop broke without assigning ilet (the !picked
            // path), continue the outer prompt loop.
            if (ilet === '?' || ilet === '*') continue;
        }
        /* find the item which was picked */
        for (otmp = inventoryHead(state); otmp; otmp = otmp.nobj)
            if (otmp.invlet === ilet) break;
        /* some items have restrictions */
        if (ilet === GOLD_SYM
            /* guard against the [hypothetical] chance of having more
               than one invent slot of gold and picking the non-'$' one */
            || (otmp && otmp.oclass === COIN_CLASS)) {
            if (otmp && (await obj_ok(otmp, state)) <= GETOBJ_EXCLUDE) {
                await ttyPline(`You cannot ${word} gold.`, state);
                return null;
            }
            if (cntgiven && cnt <= 0) {
                if (cnt < 0)
                    await ttyPline(
                        'The LRS would be very interested to know you have that much.',
                        state,
                    );
                return null;
            }
        }
        if (cntgiven && word === 'throw') {
            const coins = otmp?.oclass === COIN_CLASS;
            if (cnt === 0 || !otmp) return null;
            if (cnt > 1 && (!coins || cnt > otmp.quan)) {
                if (cnt > otmp.quan) {
                    const suffix = !coins && otmp.quan > 1
                        ? ' and can only throw one at a time' : '';
                    await ttyPline(
                        `You only have ${otmp.quan}${suffix}.`, state,
                    );
                } else {
                    await ttyPline('You can only throw one at a time.', state);
                }
                continue;
            }
        }
        state.disp.botl = true; /* May have changed the amount of money */
        if (otmp && !state.in_doagain) {
            if (cntgiven && cnt > 0) cmdq_add_int(CQ_REPEAT, cnt, state);
            // cmdq_add_key() stores the raw C key byte. Keep the queue's
            // numeric representation even though the prompt uses strings.
            cmdq_add_key(CQ_REPEAT, ilet.charCodeAt(0), state);
        }
        /* verify the chosen object */
        if (!otmp) {
            await ttyPline("You don't have that object.", state);
            continue;
        }
        if (cntgiven && (cnt < 0 || otmp.quan < cnt)) {
            await ttyPline(
                `You don't have that many! You have only ${otmp.quan}.`,
                state,
            );
            if (state.in_doagain) return null;
            continue;
        }
        break;
    }
    if ((await obj_ok(otmp, state)) === GETOBJ_EXCLUDE) {
        // Only a letter the prompt did not suggest arrives here, because the
        // suggested set holds no excluded object: eat_ok() excludes only
        // COIN_CLASS and the gold arm above returns first, any_obj_ok()
        // excludes nothing that is carried, and apply_ok(), takeoff_ok() and
        // wear_ok() exclude what the player can still type by hand.
        await silly_thing(word, otmp, state);
        return null;
    }
    if (cntgiven) {
        if (cnt === 0) return null;
        if (cnt !== otmp.quan) {
            if (splittable(otmp, state))
                otmp = splitobj(otmp, cnt, { state });
            else if (otmp.otyp === LOADSTONE && otmp.cursed)
                otmp.corpsenm = cnt;
        }
    }
    return otmp;
}

// C ref: invent.c silly_thing() (2094-2135). OBSOLETE_HANDLING is disabled in
// the upstream build; the live body only has the Amulet exception and the
// generic feedback string.
async function silly_thing(word, otmp, state = game) {
    if (word === 'call'
        && (otmp?.otyp === AMULET_OF_YENDOR
            || (otmp?.otyp === FAKE_AMULET_OF_YENDOR && !otmp.known))) {
        await ttyPline("The Amulet doesn't like being called names.", state);
    } else {
        await ttyPline(silly_thing_to.replace('%s', word), state);
    }
}

// C ref: invent.c ckvalidcat() (2136-2142). This callback is also used by
// pickup.c's category filters; the state fields are the JS equivalents of
// pickup.c's valid_menu_classes and filter flags.
export function ckvalidcat(otmp, state = game) {
    if (!state.gc?.class_filter && !state.gs?.shop_filter
        && !state.gb?.bucx_filter && !state.gp?.picked_filter)
        return false;
    const classes = state.gv?.valid_menu_classes ?? '';
    // C explicitly accepts or rejects coins on the class filter and returns
    // before applying unpaid or BUC filters.
    if (otmp.oclass === COIN_CLASS && state.gc?.class_filter)
        return classes.includes(String.fromCharCode(COIN_CLASS));
    if (state.urole?.mnum === PM_CLERIC && !otmp.bknown)
        set_bknown(otmp, 1, { state });
    if (state.gc?.class_filter
        && !classes.includes(String.fromCharCode(otmp.oclass))) return false;
    if (state.gs?.shop_filter && !otmp.unpaid
        && !(hasContents(otmp) && count_unpaid(otmp.cobj) > 0)) return false;
    if (state.gb?.bucx_filter) {
        const bucx = otmp.oclass === COIN_CLASS
            ? (state.flags?.goldX ? 'X' : 'U')
            : (!otmp.bknown ? 'X'
                : otmp.blessed ? 'B' : otmp.cursed ? 'C' : 'U');
        if (!classes.includes(bucx)) return false;
    }
    return !state.gp?.picked_filter || Boolean(otmp.pickup_prev);
}

// C ref: invent.c ckunpaid() (2143-2148).
export function ckunpaid(otmp) {
    return Boolean(otmp.unpaid
        || (hasContents(otmp) && count_unpaid(otmp.cobj)));
}

// C ref: invent.c is_worn() (2156-2166).
export function is_worn(otmp) {
    return Boolean(otmp?.owornmask
        && (otmp.owornmask & (W_ARMOR | W_ACCESSORY | W_SADDLE | W_WEAPONS)));
}

// C ref: invent.c tool_being_used() (invent.c:2169's callee in wield.c).
export function tool_being_used(obj, state = game) {
    if ((obj.owornmask ?? 0) & (W_TOOL | W_SADDLE)) return true;
    if (obj.oclass !== TOOL_CLASS) return false;
    return obj === state.uwep || obj.lamplit
        || (obj.otyp === LEASH && obj.leashmon);
}

// C ref: invent.c is_inuse() (2167-2179).
export function is_inuse(obj, state = game) {
    return Boolean(carried(obj) && (is_worn(obj) || tool_being_used(obj, state)));
}

// C ref: invent.c safeq_xprname()/safeq_shortxprname() (2180-2201). C keeps
// these two fields in a static context while askchain invokes safe_qbuf().
const safeq_xprn_ctx = { let: '\0', dot: false };
export function set_safeq_context(invlet, dot) {
    safeq_xprn_ctx.let = invlet;
    safeq_xprn_ctx.dot = Boolean(dot);
}
export function safeq_xprname(obj, state = game) {
    return xprname(obj, null, safeq_xprn_ctx.let, safeq_xprn_ctx.dot, 0, 0, state);
}
export function safeq_shortxprname(obj, state = game) {
    return xprname(
        obj,
        ansimpleoname(obj, state),
        safeq_xprn_ctx.let,
        safeq_xprn_ctx.dot,
        0,
        0,
        state,
    );
}

function collect_obj_classes_invent(head, filter, state) {
    const result = [];
    for (let obj = head; obj; obj = obj.nobj) {
        if (filter && !filter(obj, state)) continue;
        const symbol = String.fromCharCode(
            DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + obj.oclass],
        );
        if (!result.includes(symbol)) result.push(symbol);
    }
    return result;
}

// C ref: invent.c count_buc() (3548-3579). Priests identify bless/curse
// status as they inspect an object; coins follow the goldX classification.
export function count_buc(head, type, filter = null, state = game) {
    let count = 0;
    for (let obj = head; obj; obj = obj.nobj) {
        if (state.urole?.mnum === PM_CLERIC)
            obj.bknown = obj.oclass !== COIN_CLASS;
        if (filter && !filter(obj, state)) continue;
        if (obj.oclass === COIN_CLASS) {
            if (type === (state.flags?.goldX ? BUC_UNKNOWN : BUC_UNCURSED))
                count++;
            continue;
        }
        const actual = !obj.bknown ? BUC_UNKNOWN
            : obj.blessed ? BUC_BLESSED
                : obj.cursed ? BUC_CURSED : BUC_UNCURSED;
        if (actual === type) count++;
    }
    return count;
}

// C ref: invent.c tally_BUCX() (3580-3619). Counts each top-level object
// exactly once, following either nobj or nexthere, while preserving the
// priest and goldX side effects and the just-picked counter.
export function tally_BUCX(
    head, by_nexthere = false, state = game,
) {
    const result = { bcnt: 0, ucnt: 0, ccnt: 0, xcnt: 0, ocnt: 0, jcnt: 0 };
    for (let obj = head; obj;
        obj = by_nexthere ? obj.nexthere : obj.nobj) {
        if (state.urole?.mnum === PM_CLERIC)
            obj.bknown = obj.oclass !== COIN_CLASS;
        if (obj.pickup_prev) ++result.jcnt;
        if (obj.oclass === COIN_CLASS) {
            if (state.flags?.goldX) ++result.xcnt;
            else ++result.ucnt;
        } else if (!obj.bknown) ++result.xcnt;
        else if (obj.blessed) ++result.bcnt;
        else if (obj.cursed) ++result.ccnt;
        else ++result.ucnt;
    }
    return result;
}

function count_justpicked_invent(head) {
    let count = 0;
    for (let obj = head; obj; obj = obj.nobj)
        if (obj.pickup_prev) count++;
    return count;
}

// C ref: invent.c askchain() (2377-2541).  The inventory and container
// callers pass a symbolic chain name because JavaScript has no pointer to a
// mutable list head.  Read that head for each candidate, as C does through
// *objchn, since an action can remove or merge the current object.
export async function askchain(
    objchn,
    olets,
    allflag,
    fn,
    ckfn,
    mx,
    word,
    state = game,
) {
    const takeoff = taking_off(word);
    const ident = word === 'identify';
    const takeOut = word === 'take out';
    const putIn = word === 'put in';
    const nodot = word === 'nodot' || word === 'drop' || ident
        || takeoff || takeOut || putIn;
    const inInventory = objchn === 'invent' || objchn === state.invent;
    const menuClassPresent = (value) => Boolean(
        state.gv?.valid_menu_classes?.includes(
            typeof value === 'number' ? String.fromCharCode(value) : value,
        ),
    );
    const bycat = ['u', 'B', 'U', 'C', 'X', 'P'].some(menuClassPresent);
    const listHead = () => inInventory
        ? inventoryHead(state)
        : state.gc?.current_container?.cobj ?? null;

    // sortloot() snapshots the chain, while listHead() below remains live.
    // This is the same split between sortedchn and *objchn in C.
    const sorted = sortloot(
        listHead(), SORTLOOT_INVLET, false, null, state,
    );
    let count = 0;
    let dud = 0;
    let first = true;
    let classIndex = 0;
    const classes = olets ?? '';

    for (;;) {
        let ilet = 'a'.charCodeAt(0) - 1;
        const head = listHead();
        if (head && head.oclass === COIN_CLASS) --ilet;
        // C clears every object's bypass bit at the start of each class pass;
        // a class filter therefore gets a fresh traversal over the sorted
        // snapshot rather than inheriting skips from the previous class.
        const processed = new Set();

        for (const entry of sorted) {
            const candidate = entry.obj;
            if (processed.has(candidate)) continue;
            let stillPresent = false;
            for (let current = listHead(); current; current = current.nobj) {
                if (current === candidate) {
                    stillPresent = true;
                    break;
                }
            }
            if (!stillPresent) continue;
            processed.add(candidate);

            if (ilet === 'z'.charCodeAt(0)) ilet = 'A'.charCodeAt(0);
            else if (ilet === 'Z'.charCodeAt(0)) ilet = NOINVSYM.charCodeAt(0);
            else ++ilet;

            if (classes && candidate.oclass !== classes.charCodeAt(classIndex))
                continue;
            if (takeoff && !is_worn(candidate)) continue;
            if (ident && !not_fully_identified(candidate, state)) continue;
            if (ckfn && !(await ckfn(candidate, state))) continue;
            if (bycat && !ckvalidcat(candidate, state)) continue;

            let response;
            if (!allflag) {
                set_safeq_context(String.fromCharCode(ilet), !nodot);
                let prefix = '';
                if (first) {
                    if (takeOut || putIn)
                        prefix = `${word[0].toUpperCase()}${word.slice(1)}: `;
                    first = false;
                }
                const qbuf = safe_qbuf(
                    prefix,
                    '?',
                    candidate,
                    inInventory ? safeq_xprname : (obj) => donameFresh(obj, state),
                    inInventory
                        ? safeq_shortxprname
                        : (obj) => donameFresh(obj, state),
                    'item',
                    state,
                );
                // C's ynNaqchars admits a leading count only for stacks with
                // at least two units; tty_yn_function stores that count on the
                // state for this caller to consume after it returns '#'.
                const responseSet = takeoff || ident || candidate.quan < 2
                    ? 'ynaq' : 'yn#aq';
                response = String.fromCharCode(await yn_function(
                    qbuf, responseSet, 'n', false, state,
                ));
            } else {
                response = 'y';
            }

            const original = candidate;
            let selected = candidate;
            if (response === '#') {
                const number = Math.trunc(state.yn_number ?? 0);
                if (!number) {
                    response = 'n';
                } else {
                    response = 'y';
                    if (number < selected.quan && splittable(selected, state))
                        selected = splitobj(selected, number, { state });
                }
            }
            switch (response) {
            case 'a':
                allflag = true;
                // fall through
            case 'y': {
                let result = await fn(selected, state);
                if (result <= 0) {
                    const containerGone = (takeOut || putIn)
                        && !state.gc?.current_container;
                    if (containerGone) {
                        selected = null;
                    } else if (selected && selected !== original) {
                        unsplitobj(selected, { state });
                    }
                    if (result < 0) return count;
                }
                count += result;
                if (mx && --mx === 0) return count;
                // C deliberately falls through to 'n', incrementing dud for
                // every item offered when the prompt was dotless.
            }
                // falls through
            case 'n':
                if (nodot) ++dud;
                break;
            case 'q':
                if (ident) count = -1;
                return count;
            default:
                break;
            }
        }

        if (classes && ++classIndex < classes.length) continue;
        break;
    }

    if (!takeoff && (dud || count)) await ttyPline('That was all.', state);
    else if (!dud && !count) await ttyPline('No applicable objects.', state);
    return count;
}

// C ref: invent.c ggetobj() (2202-2376). The interactive class selector is
// used by Drop, Identify, and Takeoff. askchain() above owns the subsequent
// object walk, matching invent.c's same-file helper and avoiding a dependency
// cycle through pickup.js.
export async function ggetobj(
    word,
    fn,
    mx,
    combo,
    resultflags = null,
    state = game,
) {
    const setResultFlags = (value) => {
        if (resultflags && typeof resultflags === 'object')
            resultflags.value = value;
    };
    if (!inventoryHead(state)) {
        await ttyPline(`You have nothing to ${word}.`, state);
        setResultFlags(ALL_FINISHED);
        return 0;
    }

    setResultFlags(0);
    state.gv ??= {};
    state.gc ??= {};
    state.gb ??= {};
    state.gs ??= {};
    state.gp ??= {};
    state.gv.valid_menu_classes = '';
    state.gc.class_filter = false;
    state.gb.bucx_filter = false;
    state.gs.shop_filter = false;
    state.gp.picked_filter = false;
    let ckfn = null;
    let ofilter = null;
    const takeoff = taking_off(word);
    const ident = word === 'identify';
    if (takeoff) ofilter = is_worn;
    else if (ident) ofilter = (obj, current) => not_fully_identified(obj, current);

    const ilets = collect_obj_classes_invent(
        inventoryHead(state), ofilter, state,
    );
    const unpaid = count_unpaid(inventoryHead(state));
    if (ident && ilets.length === 0) return -1;
    ilets.push(' ');
    if (unpaid) ilets.push('u');
    if (count_buc(inventoryHead(state), BUC_BLESSED, ofilter, state))
        ilets.push('B');
    if (count_buc(inventoryHead(state), BUC_UNCURSED, ofilter, state))
        ilets.push('U');
    if (count_buc(inventoryHead(state), BUC_CURSED, ofilter, state))
        ilets.push('C');
    if (count_buc(inventoryHead(state), BUC_UNKNOWN, ofilter, state))
        ilets.push('X');
    if (count_justpicked_invent(inventoryHead(state))) ilets.push('P');
    ilets.push('a', 'i');
    if (!combo) ilets.push('m');

    let buf = '';
    for (;;) {
        const line = await getlin(
            `What kinds of thing do you want to ${word}? [${ilets.join('')}]`,
            state,
        );
        buf = String(line ?? '');
        if (buf.charCodeAt(0) === 0x1B) return 0;
        if (buf.includes('i')) {
            let ailets = '';
            if (ofilter) {
                for (let obj = inventoryHead(state); obj; obj = obj.nobj) {
                    if (ofilter(obj, state) && !ailets.includes(obj.invlet))
                        ailets += obj.invlet;
                }
            }
            const displayed = await display_inventory(ailets, true, state);
            if (displayed === '\x1b') return 0;
            continue;
        }
        break;
    }

    let extra = '';
    if (takeoff) {
        for (const obj of [state.uwep, state.uswapwep, state.uquiver]) {
            if (obj) {
                const cls = String.fromCharCode(obj.oclass);
                if (!extra.includes(cls)) extra += cls;
            }
        }
    }

    let allflag = false;
    let m_seen = false;
    let olets = '';
    for (const sym of buf) {
        if (sym === ' ') continue;
        const oc = def_char_to_objclass(sym);
        if (takeoff && oc !== MAXOCLASSES
            && !extra.includes(String.fromCharCode(oc))) {
            const removable = String.fromCharCode(ARMOR_CLASS)
                + String.fromCharCode(WEAPON_CLASS)
                + String.fromCharCode(RING_CLASS)
                + String.fromCharCode(AMULET_CLASS)
                + String.fromCharCode(TOOL_CLASS);
            if (!removable.includes(String.fromCharCode(oc))) {
                await ttyPline('Not applicable.', state);
                return 0;
            }
            if (oc === ARMOR_CLASS && !wearing_armor(state)) {
                await noarmor(false, state);
                return 0;
            }
            if (oc === WEAPON_CLASS
                && !state.uwep && !state.uswapwep && !state.uquiver) {
                await ttyPline('You are not wielding anything.', state);
                return 0;
            }
            if (oc === RING_CLASS && !state.uright && !state.uleft) {
                await ttyPline('You are not wearing rings.', state);
                return 0;
            }
            if (oc === AMULET_CLASS && !state.uamul) {
                await ttyPline('You are not wearing an amulet.', state);
                return 0;
            }
            if (oc === TOOL_CLASS && !state.ublindf) {
                await ttyPline('You are not wearing a blindfold.', state);
                return 0;
            }
        }
        if (sym === 'a') allflag = true;
        else if (sym === 'A') continue;
        else if (sym === 'u') {
            state.gv ??= {};
            state.gv.valid_menu_classes ??= '';
            if (!state.gv.valid_menu_classes.includes('u'))
                state.gv.valid_menu_classes += 'u';
            state.gs ??= {};
            state.gs.shop_filter = true;
            ckfn = ckunpaid;
        } else if ('BUCXP'.includes(sym)) {
            state.gv ??= {};
            state.gv.valid_menu_classes ??= '';
            if (!state.gv.valid_menu_classes.includes(sym))
                state.gv.valid_menu_classes += sym;
            state.gb ??= {};
            state.gb.bucx_filter = true;
            if (sym === 'P') {
                state.gp ??= {};
                state.gp.picked_filter = true;
            } else {
                state.gc ??= {};
                state.gc.class_filter = true;
            }
            ckfn = ckvalidcat;
        } else if (sym === 'm') {
            m_seen = true;
        } else if (oc === MAXOCLASSES) {
            await ttyPline(`You don't have any ${sym}'s.`, state);
        } else {
            const classChar = String.fromCharCode(oc);
            if (!olets.includes(classChar)) {
                state.gv ??= {};
                state.gv.valid_menu_classes ??= '';
                if (!state.gv.valid_menu_classes.includes(classChar))
                    state.gv.valid_menu_classes += classChar;
                olets += classChar;
            }
        }
    }

    if (m_seen)
        return (allflag || (!olets && ckfn !== ckunpaid && ckfn !== ckvalidcat))
            ? -2 : -3;
    if (state.flags?.menu_style !== MENU_TRADITIONAL && combo && !allflag)
        return 0;

    const count = await askchain(
        'invent', olets, allflag, fn, ckfn, mx, word, state,
    );
    if (combo && allflag)
        setResultFlags((resultflags?.value ?? 0) | ALL_FINISHED);
    return count;
}

// compactify() and invletter_value() are staticfn in invent.c and have no
// caller outside getobj() and sortloot(). They are exported here for the tests
// that pin their results to values read from the C source: the prompt reaches
// compactify() with only the letter runs a starting pack can produce, and
// reaches invletter_value() only through a pack that is already in invlet
// order, so neither is covered for its whole input range by a recorded case.
export const _getobjInternals = Object.freeze({
    compactify,
    ckunpaid,
    ckvalidcat,
    getobj_hands_txt,
    inuse_classify,
    invletter_value,
    is_inuse,
    is_worn,
    loot_classify,
    loot_xname,
    reorder_invent,
    safeq_shortxprname,
    safeq_xprname,
    silly_thing,
    sortloot_cmp,
    splittable,
    taking_off,
    mime_action,
    unsortloot,
});

// C ref: invent.c display_pickinv(). Covers the full-inventory branches (`i`
// and the ordinary throw `*` reach it), the bounded one-item suggested subset
// from getobj() (`?`), and the partial-inventory branch (equipment display
// commands pass a `lets` filter). The wizard-identify display-only branch also
// builds its PICK_NONE or PICK_ANY menu here. In-use ordering used by the
// equipment commands is selected through flags.sortloot in this same function.
export async function display_pickinv(
    lets,
    xtra_choice,
    query,
    allowxtra,
    want_reply,
    state = game,
    { menu, allowcnt = false, permanent = false } = {},
) {
    const requestedLets = lets && String(lets).length ? String(lets) : null;
    const wizid = Boolean(state.wizard && state.iflags?.override_ID);
    const usextra = Boolean(xtra_choice && allowxtra);
    const doingPermInvent = Boolean(permanent);
    const mode = Number(state.iflags?.perminv_mode ?? 0);
    const inuseOnly = doingPermInvent
        ? Boolean(mode & INV_IN_USE)
        : state.flags.sortloot === 'i';
    const showGold = !doingPermInvent || Boolean(mode & INV_SHOW_GOLD);

    // C ref: invent.c display_pickinv() (3084-3111).  The native permanent
    // inventory window is represented by the explicit `permanent` caller
    // flag; all other calls use the cached menu window.
    let n = doingPermInvent && !requestedLets && !want_reply ? 2
        : requestedLets ? requestedLets.length
            : !state.invent ? 0 : !state.invent.nobj ? 1 : 2;
    if (usextra || (n === 1 && (!requestedLets || wizid))) ++n;
    if (n === 0) {
        await ttyPline('Not carrying anything.', state);
        return null;
    }
    if (!state.flags.invlet_constant)
        reassign(state);

    // C ref: invent.c display_pickinv() (3160-3183).  The single-item arm
    // uses a message-line menu, including PICK_NONE for display-only calls.
    if (n === 1 && !state.iflags.force_invmenu
        && !state.iflags.menu_requested) {
        let match = null;
        for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
            if (!requestedLets || requestedLets.includes(otmp.invlet)) {
                match = otmp;
                break;
            }
        }
        if (usextra) {
            const mesg = xprname(null, xtra_choice, HANDS_SYM, true,
                0, 0, state);
            const response = await tty_message_menu(
                HANDS_SYM.charCodeAt(0), PICK_ONE, mesg, state);
            const selected = response ? String.fromCharCode(response) : null;
            return allowcnt && selected ? { value: selected, count: -1 }
                : selected;
        }
        if (!match) return null;
        const mesg = xprname(match, null,
            requestedLets ? requestedLets[0] : match.invlet,
            true, 0, 0, state);
        const response = await tty_message_menu(
            match.invlet.charCodeAt(0), want_reply ? PICK_ONE : PICK_NONE,
            mesg, state,
        );
        const selected = want_reply && response
            ? String.fromCharCode(response) : null;
        return allowcnt && selected ? { value: selected, count: -1 }
            : selected;
    }

    const unidCount = wizid ? count_unidentified(inventoryHead(state), state) : 0;
    const menuHow = wizid ? (unidCount ? PICK_ANY : PICK_NONE)
        : want_reply ? PICK_ONE : PICK_NONE;
    const menuOwner = menu ?? ((items, _state, how = PICK_ONE) => select_menu(state, {
        title: query && String(query).length ? query : undefined,
        items,
        how,
        returnCount: Boolean(allowcnt),
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    }));

    // C's name and glyph calls can mutate discovery and consume display RNG.
    for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
        if (requestedLets && !requestedLets.includes(otmp.invlet)) continue;
        if (wizid && !not_fully_identified(otmp, state)) continue;
        assertObjectNameable(otmp, state);
    }

    let sortflags = state.flags.sortloot === 'f'
        ? SORTLOOT_LOOT : SORTLOOT_INVLET;
    if (state.flags.sortpack) sortflags |= SORTLOOT_PACK;
    if (inuseOnly) sortflags = SORTLOOT_INUSE;
    const fake = !state.uwep && inuseOnly ? {
        invlet: HANDS_SYM, oclass: ILLOBJ_CLASS, otyp: 0,
        owornmask: W_WEP, where: OBJ_INVENT, nobj: null,
    } : null;
    if (fake) fake.nobj = state.invent;
    const sortedinvent = sortloot(fake ?? inventoryHead(state), sortflags,
        false, inuseOnly ? (obj) => is_inuse(obj, state) : null, state);
    if (fake) {
        // sortloot()'s filter accepts the synthetic wielded-hands object only
        // because it carries the same worn and ownership fields as C's copy.
        const found = sortedinvent.some((entry) => entry.obj === fake);
        if (!found) sortedinvent.push({
            obj: fake, str: null, indx: -1, orderclass: 3,
            subclass: 0, disco: 0, inuse: 12,
        });
        sortedinvent.sort((left, right) => sortloot_cmp(
            left, right, SORTLOOT_INUSE, state,
        ));
    }

    const items = [];
    let gotsomething = false;
    let skippedGold = false;
    const wizidFakeobj = wizid ? Object.freeze({}) : null;
    if (wizid) {
        let title = 'Debug Identify';
        if (unidCount)
            title += ` -- unidentified or partially identified item${unidCount === 1 ? '' : 's'}`;
        items.push({ text: title });
        if (!unidCount) {
            items.push({ text: '(all items are permanently identified already)' });
            gotsomething = true;
        } else {
            let label = `select ${unidCount === 1 ? 'it' : 'any or all of them'} to permanently identify`;
            if (unidCount > 1)
                label += ` (${visctrl(state.iflags.override_ID)} for all)`;
            items.push({
                selector: '_',
                groupSelector: String.fromCharCode(state.iflags.override_ID),
                label,
                value: wizidFakeobj,
                skipinvert: true,
            });
            gotsomething = true;
        }
    } else if (usextra) {
        items.push({ selector: HANDS_SYM, label: xtra_choice, value: HANDS_SYM });
        gotsomething = true;
    }

    if (inuseOnly) {
        let previousOrderclass = 0;
        let inuseCount = 0;
        const headers = state.inuseHeaders ?? [
            '', 'Miscellaneous', 'Worn Armor',
            'Wielded/Readied Weapons', 'Accessories',
        ];
        for (const entry of sortedinvent) {
            const otmp = entry.obj;
            if (requestedLets && !requestedLets.includes(otmp.invlet)) continue;
            if (!inuseCount++) {
                items.push(add_menu_heading(
                    doingPermInvent ? 'In use' : 'Inventory in use', state));
            }
            if (entry.orderclass !== previousOrderclass) {
                items.push(add_menu_heading(headers[entry.orderclass] ?? '', state));
                previousOrderclass = entry.orderclass;
            }
            if (otmp === fake) {
                items.push({
                    selector: HANDS_SYM,
                    label: `${state.uarmg ? 'gloved' : 'bare'} ${makeplural(body_part(HAND, state.youmonst))} (no weapon)`,
                    value: HANDS_SYM,
                });
            } else {
                const glyphInfo = obj_to_glyph(otmp, state);
                items.push({
                    selector: otmp.invlet,
                    label: donameFresh(otmp, state),
                    value: wizid ? otmp : otmp.invlet,
                    glyphInfo,
                });
            }
            gotsomething = true;
        }
    } else {
        // invent.c walks flags.inv_order, then makes a final pass over its
        // private venom_inv class so wizard-created venom remains displayable
        // without becoming a normal inventory-class choice.
        const classes = [
            ...(state.flags.inv_order ?? []), VENOM_CLASS,
        ];
        const classPasses = state.flags.sortpack ? classes : [null];
        for (const oclass of classPasses) {
            let classcount = 0;
            for (const entry of sortedinvent) {
                const otmp = entry.obj;
                if (oclass !== null && otmp.oclass !== oclass) continue;
                if (requestedLets && !requestedLets.includes(otmp.invlet)) continue;
                if (wizid && !not_fully_identified(otmp, state)) continue;
                if (doingPermInvent && !showGold && otmp.invlet === GOLD_SYM
                    && !otmp.owornmask) {
                    skippedGold = true;
                    continue;
                }
                if (state.flags.sortpack && !classcount++) {
                    items.push(add_menu_heading(
                        let_to_name(oclass, false,
                            want_reply && state.iflags.menu_head_objsym), state));
                }
                const glyphInfo = obj_to_glyph(otmp, state);
                items.push({
                    selector: otmp.invlet,
                    label: donameFresh(otmp, state),
                    value: wizid ? otmp : otmp.invlet,
                    glyphInfo,
                });
                gotsomething = true;
            }
        }
    }
    if (state.iflags.force_invmenu && want_reply && !wizid) {
        let selector = null;
        let label = null;
        if ((allowxtra && !usextra)
            || (requestedLets && requestedLets.length < inv_cnt(true, state))) {
            selector = '*'; label = '(list everything)';
        } else if (!requestedLets) {
            selector = '?'; label = '(list likely candidates)';
        }
        if (selector) {
            items.push(add_menu_heading('Special', state));
            items.push({ selector, label, value: selector });
            gotsomething = true;
        }
    }
    if (doingPermInvent && !requestedLets && !gotsomething) {
        items.push({
            text: inuseOnly ? 'Not using any items'
                : skippedGold ? 'Only carrying gold' : 'Not carrying anything',
        });
    }
    const selected = await menuOwner(items, state, menuHow);
    if (!wizid && allowcnt && selected
        && typeof selected === 'object' && !Array.isArray(selected)
        && Object.hasOwn(selected, 'value')) return selected;
    if (!wizid) return selected;
    if (!Array.isArray(selected) || selected.length === 0) return null;
    state.iflags.override_ID = 0;
    let allId = false;
    for (const entry of selected) {
        if (entry.value === wizidFakeobj) {
            await identify_pack(0, false, state);
            allId = true;
            break;
        }
        if (not_fully_identified(entry.value, state))
            await identify(entry.value, state);
    }
    if (!allId) update_inventory({ state });
    return null;
}

// C ref: invent.c display_inventory() (3428-3455).  A queued inventory key
// is consumed before any window is opened; the queue may contain a raw key
// from itemactions_pushkeys(), so preserve the source's class-symbol filter.
export async function display_inventory(lets, want_reply, state = game, hooks = {}) {
    const queued = cmdq_pop(state);
    if (queued) {
        if (queued.typ === CMDQ_KEY) {
            const key = String.fromCharCode(queued.key);
            for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj) {
                const symbol = String.fromCharCode(
                    DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + otmp.oclass],
                );
                if (otmp.invlet === key
                    && (!lets || !String(lets).length
                        || String(lets).includes(symbol))) return key;
            }
        }
        cmdq_clear(CQ_CANNED, state);
        return null;
    }
    return display_pickinv(lets, null, null, false, want_reply, state, hooks);
}

// C ref: invent.c repopulate_perminvent() (3456-3466). When the permanent
// inventory window asks for a refresh, display_pickinv() keeps the empty and
// display-only paths alive so the window removes stale rows.
export async function repopulate_perminvent(state = game, hooks = {}) {
    return display_pickinv(
        null, null, null, false, false, state,
        { ...hooks, permanent: true },
    );
}

// C ref: invent.c display_used_invlets() (3467-3525). The menu lists every
// occupied inventory letter except avoidlet, preserving class headings when
// sortpack is enabled and returning the selected letter or null on cancel.
export async function display_used_invlets(
    avoidlet = '\0', state = game, hooks = {},
) {
    if (!inventoryHead(state)) return null;
    const items = [];
    const classes = state.flags.sortpack ? state.flags.inv_order : [null];
    for (const oclass of classes) {
        let classcount = 0;
        for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj) {
            if (oclass !== null && otmp.oclass !== oclass) continue;
            if (otmp.invlet === avoidlet) continue;
            if (state.flags.sortpack && !classcount++)
                items.push(add_menu_heading(
                    let_to_name(oclass, false, false), state));
            assertObjectNameable(otmp, state);
            // C computes the glyph before doname() while building this menu.
            const glyphInfo = obj_to_glyph(otmp, state);
            items.push({
                selector: otmp.invlet,
                label: donameFresh(otmp, state),
                value: otmp.invlet,
                glyphInfo,
            });
        }
    }
    const menu = hooks.menu ?? ((rows, _state, how = PICK_ONE) => select_menu(state, {
        title: 'Inventory letters used:',
        items: rows,
        how,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    }));
    return menu(items, state, PICK_ONE);
}

// C ref: invent.c dispinv_with_action() (2964-3002). When lets has
// exactly one letter and menu_requested is off, menumode is false:
// display_pickinv() shows the item on the message line and returns 0,
// so itemactions() is never called.
export async function dispinv_with_action(lets, state = game, hooks = {}) {
    const len = lets ? lets.length : 0;
    const useInuseOrdering = Boolean(hooks.useInuseOrdering);
    const savedSortloot = state.flags.sortloot;
    const savedForceInvmenu = state.iflags.force_invmenu;
    const savedHeaders = state.inuseHeaders;
    if (useInuseOrdering) {
        state.flags.sortloot = 'i';
        const label = hooks.altLabel;
        state.inuseHeaders = [
            '', 'Miscellaneous', 'Worn Armor',
            'Wielded/Readied Weapons', label ?? 'Accessories',
        ];
    }
    state.iflags.force_invmenu = false;
    const menumode = (len !== 1 || state.iflags.menu_requested);
    let chosen;
    try {
        // The menu owner answers null for Escape, which is C's '\033' reaching
        // dispinv_with_action() without matching any invlet.
        chosen = await display_inventory(lets, menumode, state, hooks);
    } finally {
        state.flags.sortloot = savedSortloot;
        state.iflags.force_invmenu = savedForceInvmenu;
        if (savedHeaders === undefined) delete state.inuseHeaders;
        else state.inuseHeaders = savedHeaders;
    }
    if (chosen != null) {
        for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj) {
            if (otmp.invlet === chosen)
                return itemactions(otmp, state, hooks);
        }
    }
    return ECMD_OK;
}

// C ref: invent.c ddoinv(). Returns whether the command consumed game time,
// which for the inventory display is never.
export async function ddoinv(state = game, hooks = {}) {
    return dispinv_with_action(null, state, hooks);
}

// C ref: hack.h Blind. The engraving and description code below reads only
// the hero's blindness, not the other senses that macro folds in.
function heroIsBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean(
        (blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked,
    );
}

// C ref: invent.c carrying_stoning_corpse() (1508-1516). Scans the hero's
// inventory for the first corpse whose species petrifies on touch.
export function carrying_stoning_corpse(state = game) {
    for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
        if (otmp.otyp === CORPSE && touch_petrifies(state.mons[otmp.corpsenm]))
            return otmp;
    }
    return null;
}

// C ref: invent.c u_carried_gloves() (1533-1545).  uarmg is the worn-gloves
// pointer; when it is unset, C falls back to the first gloves object in the
// inventory chain.
export function u_carried_gloves(state = game) {
    if (state.uarmg) return state.uarmg;
    for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj) {
        if (is_gloves(otmp, state)) return otmp;
    }
    return null;
}

// C ref: invent.c u_have_novel() (1548-1557).  This is a plain inventory
// traversal and deliberately does not inspect the spellbook's contents.
export function u_have_novel(state = game) {
    return carrying(SPE_NOVEL, state);
}

// C ref: invent.c o_on() (1560-1573).  Search each sibling before recursively
// descending into its contents, preserving the depth-first source order.
export function o_on(id, objchn) {
    for (let obj = objchn; obj; obj = obj.nobj) {
        if (obj.o_id === id) return obj;
        if (hasContents(obj)) {
            const found = o_on(id, obj.cobj);
            if (found) return found;
        }
    }
    return null;
}

// C ref: invent.c obj_here() (1576-1588).  Floor piles use nexthere links;
// identity, rather than object type or id, is the predicate.
export function obj_here(obj, x, y, state = game) {
    for (let current = state.level?.objects?.[x]?.[y] ?? null;
        current;
        current = current.nexthere) {
        if (current === obj) return true;
    }
    return false;
}

// C ref: invent.c sobj_at() (1465-1475).  The object module owns the same
// floor-grid primitive for its mkobj.c callers; expose that implementation
// here too so invent.c callers can use its source-named entry point.
export function sobj_at(otyp, x, y, state = game) {
    return object_sobj_at(otyp, x, y, state);
}

// C ref: invent.c will_feel_cockatrice(). A sighted hero without forced touch
// never feels a corpse, whatever it is, so feel_cockatrice() is a no-op there.
export function will_feel_cockatrice(otmp, force_touch, state = game) {
    return Boolean((heroIsBlind(state) || force_touch)
        && !state.uarmg
        && !Stone_resistance(state)
        && otmp.otyp === CORPSE
        && touch_petrifies(state.mons[otmp.corpsenm]));
}

// C ref: invent.c feel_cockatrice(). The final killer_xname()/instapetrify()
// call is a trap.c side effect; record that dependency after preserving the
// warning, as other petrification callers do in this port.
export async function feel_cockatrice(
    otmp, force_touch, state = game, { message } = {},
) {
    if (!will_feel_cockatrice(otmp, force_touch, state)) return;

    const corpseName = corpse_xname(otmp, null, CXN_PFX_THE, state);
    const pline = message ?? ttyPline;
    if (poly_when_stoned(state.youmonst?.data, state)) {
        const hands = makeplural(body_part(HAND, state.youmonst));
        await pline(`You touched ${corpseName} with your bare ${hands}.`, state);
    } else {
        await pline(`Touching ${corpseName} is a fatal mistake...`, state);
    }

    // killer_xname() feeds the unported instapetrify() call and has no result
    // visible before that call, so leave both source operations at the same
    // dependency boundary rather than inventing a second state owner.
    note_unported('trap.c instapetrify');
}

// C ref: youprop.h:65 Stone_resistance, which is
// (HStone_resistance || EStone_resistance) and carries no `blocked` term --
// unlike Blind() at :103, which does. js/pickup.js reads the same macro for
// u_safe_from_fatal_corpse()'s st_resists arm, so the two must agree.
function Stone_resistance(state) {
    const property = state.u?.uprops?.[STONE_RES];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// Mutation-free admission for look_here() through its first complete result.
// `objects` projects the floor chain after an automatic pickup without
// `obj_cnt` is invent.c's caller-owned parameter, deliberately independent of
// the floor chain: check_here() passes its count for pile_limit, while dolook()
// passes zero even when it inspects the same objects.
export function preflight_look_here(
    obj_cnt,
    lookhere_flags,
    state = game,
    { objects = null } = {},
) {
    const blind = heroIsBlind(state);
    const { ux, uy } = state.u;
    const skip_dfeature = (lookhere_flags & LOOKHERE_SKIP_DFEATURE) !== 0;
    const skip_objects = state.flags.pile_limit > 0
        && obj_cnt >= state.flags.pile_limit;
    const pickedSome = (lookhere_flags & LOOKHERE_PICKED_SOME) !== 0;
    // C returns from the swallowed arm before reading the floor object chain,
    // trap, region, or object names.  Keep admission on that same boundary so
    // an unrelated floor object cannot reject the monster-inventory display.
    if (state.u.uswallow) {
        return {
            blind,
            cant_reach: undefined,
            cannotReachObjects: undefined,
            hasPile: false,
            objectList: [],
            otmp: null,
            pickedSome,
            region: null,
            seenTrap: null,
            skip_dfeature,
            skip_objects,
            withShopPrice: false,
        };
    }
    const objectList = objects ?? (() => {
        const result = [];
        for (let object = state.level.objects[ux]?.[uy] ?? null;
            object;
            object = object.nexthere) result.push(object);
        return result;
    })();
    const otmp = objectList[0] ?? null;
    const hasPile = objectList.length > 1;
    const withShopPrice = Boolean(otmp) && costly_spot(ux, uy, state);
    const trap = t_at(ux, uy, state);
    // C ref: invent.c look_here() (4162-4178). The live call names only a
    // visible region and a trap whose tseen bit is set; admission records both
    // so output can remain source-ordered without mutating the projection.
    const region = !skip_objects ? visible_region_at(ux, uy, state) : null;
    const seenTrap = !skip_objects && trap?.tseen ? trap : null;
    if (hasPile && !skip_objects) {
        for (const object of objectList) {
            if (withShopPrice)
                assertPricedObjectNameable(object, state);
            else
                assertObjectNameable(object, state);
        }
    }

    let cant_reach;
    let cannotReachObjects;
    if (blind) {
        cant_reach = !can_reach_floor(undefined, state);
        cannotReachObjects = !can_reach_floor(
            Boolean(trap && is_pit(trap.ttyp)),
            state,
        );
    }

    if (otmp && !hasPile && !skip_objects) {
        if (withShopPrice)
            assertPricedObjectNameable(otmp, state);
        else
            assertObjectNameable(otmp, state);
    }
    return {
        blind,
        cant_reach,
        cannotReachObjects,
        hasPile,
        objectList,
        otmp,
        pickedSome,
        region,
        seenTrap,
        skip_dfeature,
        skip_objects,
        withShopPrice,
    };
}

// C ref: invent.c look_here(). Covers a hero standing on an admitted square,
// sighted or blind: swallowed inventory, region/trap preamble, terrain feature
// line, engraving read, and the no-object, single-object, arbitrary pile, or
// pile-limit count. A blind pile uses the source tactile heading and
// cockatrice warning; the admission helper must not reject those source arms.
//
// Returns true where C returns ECMD_TIME and false where it returns ECMD_OK,
// so the caller decides whether the command takes game time.
export async function look_here(
    obj_cnt,
    lookhere_flags,
    state = game,
    {
        message,
        readEngraving,
        displayObjectPile = (lines) => displayTtyMenuTextWindow(state, lines),
        displayMinventory = display_minventory,
    } = {},
) {
    if (typeof message !== 'function' || typeof readEngraving !== 'function')
        throw new TypeError('look_here needs message and engraving owners');
    const plan = preflight_look_here(
        obj_cnt,
        lookhere_flags,
        state,
    );
    const {
        blind,
        cant_reach,
        cannotReachObjects,
        hasPile,
        otmp,
        pickedSome,
        region,
        seenTrap,
        skip_objects,
        withShopPrice,
    } = plan;
    const verb = blind ? 'feel' : 'see';
    const { ux, uy } = state.u;

    // C invent.c:look_here() (4121-4158) describes an engulfer's inventory
    // before it reads the square.  The inventory menu is the same source
    // owner used by #inventory; callers may inject it only for isolated tests.
    if (state.u.uswallow) {
        const mtmp = state.u.ustuck;
        const contents = `Contents of ${s_suffix(mon_nam(mtmp, state))} `
            + `${mbodypart(mtmp, STOMACH)}`;
        await message(
            `You ${blind ? 'try' : 'look around'} to ${verb} what is lying in `
            + `${contents.slice(12)}.`,
            state,
        );
        let object = mtmp?.minvent ?? null;
        if (object) {
            for (; object; object = object.nobj) {
                if (object.otyp === CORPSE)
                    await feel_cockatrice(object, false, state, { message });
            }
            const title = blind ? 'You feel:' : `${contents}:`;
            await displayMinventory(
                mtmp,
                MINV_ALL | PICK_NONE,
                title,
                state,
            );
        } else {
            await message(`You ${verb} no objects here.`, state);
        }
        return blind;
    }

    // C invent.c:look_here() (4162-4178). This line precedes the terrain
    // feature and tactile-surface output, and is omitted by the count arm.
    if (region || seenTrap) {
        const regionText = region
            ? `a ${Math.trunc(region.arg ?? 0) ? 'poison gas' : 'vapor'} cloud`
            : '';
        const trapText = seenTrap ? an(trapname(seenTrap.ttyp, false, state)) : '';
        await message(
            `There is ${regionText}${region && seenTrap ? ' and ' : ''}`
            + `${trapText ? `${trapText}` : ''} here.`,
            state,
        );
    }

    // invent.c look_here() describes the feature before its blind-surface
    // wording. Both helpers can consume display RNG, and dfeature_at() also
    // updates ice_rating; admission must leave these effects to the live call.
    let dfeature = dfeature_at(ux, uy, state);
    if (dfeature === 'pool of water' && state.u.uinwater) dfeature = null;
    let skip_dfeature = plan.skip_dfeature;
    if (blind) {
        const drift = Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz);
        if (dfeature?.startsWith('altar ')) {
            await message('You try to feel what is here.', state);
        } else if (is_ice(ux, uy, state)) {
            if (!state.flags?.mention_decor
                || state.iflags?.prev_decor === ICE) {
                await force_decor(false, state, { message });
            }
            await message('You try to feel what is on it.', state);
            skip_dfeature = true;
        } else {
            const surf = surface(ux, uy, state);
            await message(
                `You try to feel what is ${
                    drift ? 'floating here'
                        : cant_reach ? 'lying beneath you'
                            : `lying here on the ${surf}`
                }.`,
                state,
            );
            if (dfeature === surf && !drift) skip_dfeature = true;
        }
        if (cannotReachObjects) {
            await message("But you can't reach it!", state);
            return false;
        }
    }

    let fbuf = '';
    if (dfeature && !skip_dfeature) {
        // "molten lava", "iron bars", and plain ice are special cases in an(),
        // which C declines to rely on, so it drops the article itself.
        const article = !(dfeature === 'molten lava'
            || dfeature === 'iron bars'
            || dfeature === 'ice'
            || dfeature.startsWith('frozen ')
            || / ice$/iu.test(dfeature));
        const named = article ? an(dfeature) : dfeature;
        fbuf = `There ${vtense(named, 'are')} ${named} here.`;
    }

    if (!otmp || is_lava(ux, uy, state)
        || (is_pool(ux, uy, state) && !state.u.uinwater)) {
        if (dfeature && !skip_dfeature) await message(fbuf, state);
        await readEngraving(state);
        if (!skip_objects && (blind || !dfeature))
            await message(`You ${verb} no objects here.`, state);
        return blind;
    }
    if (skip_objects) {
        if (dfeature && !skip_dfeature) await message(fbuf, state);
        await readEngraving(state);
        const countName = obj_cnt === 2 ? 'two'
            : obj_cnt < 5 ? 'a few'
                : obj_cnt < 10 ? 'several' : 'many';
        const countText = obj_cnt === 1 && otmp.quan === 1
            ? `There is ${pickedSome ? 'another' : 'an'} object here.`
            : `There are ${countName}${pickedSome ? ' more' : ''} objects here.`;
        await message(countText, state);
        for (let object = otmp; object; object = object.nexthere) {
            if (object.otyp !== CORPSE
                || !will_feel_cockatrice(object, false, state)) continue;
            const article = object.quan > 1 ? "They're" : "It's";
            await message(
                `${obj_cnt > 1 ? 'Including' : article} `
                + `${corpse_xname(object, null, CXN_ARTICLE, state)}`
                + `${poly_when_stoned(state.youmonst?.data, state) ? '' : ', unfortunately'}.`,
                state,
            );
            await feel_cockatrice(object, false, state, { message });
            break;
        }
        return blind;
    }
    if (otmp.nexthere) {
        if (typeof displayObjectPile !== 'function')
            throw new TypeError('look_here needs an object-pile display owner');
        const lines = [];
        if (dfeature && !skip_dfeature) lines.push(fbuf, '');
        // C invent.c:look_here() (4289-4296) formats the prefix and predicate
        // as one sentence using "%s that %s here:"; both blind and sighted
        // piles retain the common "that" in the heading.
        lines.push(`${pickedSome ? 'Other things' : 'Things'} ${blind ? 'that you feel' : 'that are'} here:`);
        let feltCockatrice = null;
        for (let object = otmp; object; object = object.nexthere) {
            const canFeelCockatrice = object.otyp === CORPSE
                && will_feel_cockatrice(object, false, state);
            lines.push(canFeelCockatrice
                ? `${donameFresh(object, state)}...`
                : withShopPrice
                ? doname_with_price(object, state, { currencyName: currency })
                : donameFresh(object, state));
            if (canFeelCockatrice) {
                feltCockatrice = object;
                break;
            }
        }
        // C invent.c look_here() first calls display_nhwindow(WIN_MESSAGE,
        // FALSE) at 4289. On TTY that retires the logical topline while
        // preserving an already acknowledged physical line for a corner menu.
        await displayPendingTtyMessageWindow(state);
        await displayObjectPile(lines, state);
        if (feltCockatrice)
            await feel_cockatrice(feltCockatrice, false, state, { message });
        await readEngraving(state);
        return blind;
    }
    if (dfeature && !skip_dfeature) await message(fbuf, state);
    await readEngraving(state);
    const namedObject = withShopPrice
        ? doname_with_price(otmp, state, { currencyName: currency })
        : donameFresh(otmp, state);
    await message(`You ${verb} here ${namedObject}.`, state);
    state.iflags.last_msg = PLNMSG_ONE_ITEM_HERE;
    if (otmp.otyp === CORPSE)
        await feel_cockatrice(otmp, false, state, { message });
    return blind;
}

// C ref: invent.c dolook(). C hides the norep and noshow message types around
// the call so a player's MSGTYPE configuration cannot suppress this feedback;
// restore the list even when a look_here() owner reports an error.
export async function dolook(state = game, hooks = {}) {
    hide_unhide_msgtypes(true, MSGTYP_MASK_REP_SHOW, state);
    try {
        return await look_here(0, LOOKHERE_NOFLAGS, state, hooks);
    } finally {
        hide_unhide_msgtypes(false, MSGTYP_MASK_REP_SHOW, state);
    }
}

function inventoryEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

function requiredHook(env, name, obj) {
    const hook = env.hooks?.[name];
    if (typeof hook !== 'function')
        throw new UnsupportedObjectOperationError(name, obj);
    return hook;
}

// InventoryEnv hook contract. Predicates are pure. Mutators run at their C
// call boundary and must leave the object invariants named by the caller.
// Missing live hooks throw UnsupportedObjectOperationError before mutation
// whenever the branch can be preflighted.
//
// Predicates: artifactConfersLuck(obj, env), isReviver(species, env),
// samePrice(obj, target, env), isDeadSpecies(species, includeGone, env).
// Inventory effects: removeSpecialInventoryEffects(obj, env),
// archeologistDeciphersScroll(obj, env), recordAchievement(id, env),
// updateInventory(state).
// attachFigurineTimer(obj, env) and stopFigurineTimer(obj, env) own both the
// external timer queue and obj.timed, as NetHack's timer subsystem does.
// Ownership/lifetime: extractExternalObject(obj, env),
// objectNoLongerHeld(obj, env), stopObjectTimers(obj, env),
// deleteObjectLightSource(obj, env), unleashObject(obj, env),
// resetPick(obj, env). obfreeShopBill(obj, merge, env) returns 'retained' when
// the shop moves obj to OBJ_ONBILL, 'billed' when it merged an existing bill
// entry, or 'unbilled' when normal deletion and price adjustment should run.
// 'preserved' is obfree's diagnostic return when the merge target lacks a bill.
// Merge effects: mergeLightSources(obj, target, env),
// mergeWornMasks(target, obj, env). absorbGlob(target, obj, env) owns
// mkobj.c obj_absorb(), including globby_bill_fixup(), timeout recombination,
// target updates, and leaving obj deallocated as OBJ_DELETED or OBJ_LUAFREE.
// inventoryComparisonDiscovered(target, env), setNotWorn(obj, env).

function suppressMapOutput(state) {
    return Boolean(state.in_mklev
        || state.program_state?.saving
        || state.program_state?.restoring
        || state.program_state?.done_hup);
}

function inventoryRefreshActive(env) {
    return Boolean(env.state.program_state?.in_moveloop)
        && !suppressMapOutput(env.state);
}

function requireInventoryRefresh(env) {
    if (!inventoryRefreshActive(env)) return;
    if (env.state.iflags?.perm_invent
        && typeof env.hooks.updateInventory !== 'function') {
        throw new UnsupportedObjectOperationError('updateInventory');
    }
}

// Dependency-only half of update_inventory(). Callers which must mutate
// other state first can preserve C order while still failing atomically when
// the permanent-inventory window boundary is unavailable.
export function preflight_update_inventory(env = {}) {
    const normalized = inventoryEnv(env);
    requireInventoryRefresh(normalized);
    return normalized;
}

// C ref: invent.c count_contents() (3620-3651). Counts the items inside a
// container. With everything=true the function counts every stack; with
// everything=false it counts only unpaid items (checking costly_spot for
// shop pricing). quantity selects between counting stacks (false) and
// counting individual items by quan (true). nested recurses into nested
// containers.
export function count_contents(container, nested, quantity, everything,
    newdrop, state = game) {
    let shoppy = false;
    let count = 0;

    // invent.c:3634-3642. Shop-pricing flag, only when filtering.
    if (!everything && !newdrop) {
        let topc = container;
        while (topc.where === OBJ_CONTAINED) topc = topc.ocontainer;
        if (topc.where === OBJ_FLOOR) {
            const loc = get_obj_location(topc, 0, state);
            if (loc) shoppy = costly_spot(loc.x, loc.y, state);
        }
    }

    for (let otmp = container.cobj; otmp; otmp = otmp.nobj) {
        if (nested && hasContents(otmp)) {
            count += count_contents(otmp, nested, quantity, everything,
                newdrop, state);
        }
        if (everything || otmp.unpaid || (shoppy && !otmp.no_charge)) {
            count += quantity ? otmp.quan : 1;
        }
    }
    return count;
}

// C ref: invent.c count_unidentified() (2698-2708).
export function count_unidentified(objchn, state = game) {
    let unidCount = 0;
    for (let obj = objchn; obj; obj = obj.nobj) {
        if (not_fully_identified(obj, state)) ++unidCount;
    }
    return unidCount;
}

// C ref: invent.c set_cknown_lknown() (2624-2635). Containers and statues
// expose their contents and tins expose their contents' type when the object
// itself is fully identified.
export function set_cknown_lknown(obj) {
    if (isContainer(obj) || obj.otyp === STATUE) {
        obj.cknown = true;
        obj.lknown = true;
    } else if (obj.otyp === TIN) {
        obj.cknown = true;
    }
}

// C ref: invent.c fully_identify_obj() (2637-2650). This mutates only the
// object's knowledge flags; identify() owns the immediate inventory message.
export function fully_identify_obj(obj, state = game) {
    // hack.h makeknown() expands to discover_object(otyp, TRUE, TRUE, TRUE).
    discover_object(obj.otyp, true, true, true, state);
    if (obj.oartifact)
        discover_artifact(obj.oartifact, state);
    observe_object(obj, state);
    obj.known = true;
    obj.bknown = true;
    obj.rknown = true;
    set_cknown_lknown(obj);
    if (obj.otyp === EGG && obj.corpsenm !== NON_PM)
        note_unported('timeout.c learn_egg_type');
}

// C ref: invent.c identify() (2653-2657). The callback returns one so its
// caller can count identified objects; prinv() is awaited because the C
// callback emits its message before identify_pack() continues.
export async function identify(obj, state = game) {
    fully_identify_obj(obj, state);
    await prinv(null, obj, 0, { state });
    return 1;
}

// C ref: invent.c menu_identify() (2660-2695). query_objlist() owns the menu
// window in this port; the retry, ESC, no-eligible, and per-item limits remain
// in this source function in the same order as C.
export async function menu_identify(idLimit, state = game) {
    const { query_objlist } = await import('./pickup.js');
    let first = true;
    let tries = 5;
    while (idLimit) {
        const title = `What would you like to identify ${first ? 'first' : 'next'}?`;
        const result = await query_objlist(
            inventoryHead(state),
            SIGNAL_NOMENU | SIGNAL_ESCAPE | USE_INVLET | INVORDER_SORT,
            (obj, current) => not_fully_identified(obj, current),
            state,
            title,
        );
        let n = result.n;
        if (n > 0) {
            n = Math.min(n, idLimit);
            for (let i = 0; i < n; ++i, --idLimit)
                await identify(result.pick_list[i].obj, state);
            first = false;
            if (idLimit) await tty_wait_synch(state);
        } else if (n === -2) {
            break;
        } else if (n === -1) {
            await ttyPline('That was all.', state);
            break;
        } else if (!--tries) {
            await ttyPline("That's enough tries!", state);
            break;
        } else {
            await ttyPline('Choose an item; use ESC to decline.', state);
        }
    }
}

// C ref: invent.c identify_pack() (2710-2744). The automatic-all branch is
// used by an ordinary identify scroll when its cval covers the remaining
// incomplete objects. Traditional finite selection routes through ggetobj;
// the full-menu fallback is menu_identify().
export async function identify_pack(idLimit, learningId, state = game) {
    const unidCount = count_unidentified(inventoryHead(state), state);
    if (!unidCount) {
        await ttyPline(
            `You have already identified ${learningId ? 'the rest' : 'all'} `
            + 'of your possessions.',
            state,
        );
    } else if (!idLimit || idLimit >= unidCount) {
        let remaining = unidCount;
        for (let obj = inventoryHead(state); obj; obj = obj.nobj) {
            if (!not_fully_identified(obj, state)) continue;
            await identify(obj, state);
            if (--remaining < 1) break;
        }
    } else if (state.flags?.menu_style === MENU_TRADITIONAL) {
        let remaining = idLimit;
        let selected = 0;
        do {
            selected = await ggetobj(
                'identify', identify, remaining, false, null, state,
            );
            if (selected < 0) break;
            remaining -= selected;
        } while (remaining > 0);
        if (selected === 0 || selected < -1)
            await menu_identify(remaining, state);
    } else {
        await menu_identify(idLimit, state);
    }
    update_inventory({ state });
}

// C ref: invent.c learn_unseen_invent() (2750-2775). Called when the hero
// regains sight (e.g. removing a blindfold). Iterates inventory and marks
// items that were picked up while blind as seen, by calling xnameFresh()
// (which sets dknown via observe_object()) and triggering any reactions
// that seeing the object for the first time produces (addinv_core2).
//
export async function learn_unseen_invent(state = game, env = {}) {
    if (heroIsBlind(state))
        return; /* sanity check */

    let invupdated = false;
    for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj) {
        // C ref: invent.c:2759-2761. Skip items the hero has already seen.
        // dknown is set by observe_object(); bknown matters only for clerics;
        // scrolls matter only for Archeologists.
        if (otmp.dknown
            && (otmp.bknown || state.urole?.mnum !== PM_CLERIC)
            && (otmp.oclass !== SCROLL_CLASS
                || state.urole?.mnum !== PM_ARCHEOLOGIST))
            continue; /* already seen */
        invupdated = true;
        // C ref: invent.c:2765. maybereleaseobuf(xname(otmp)) -- the call
        // exists for its side effect: xname() calls observe_object() which
        // sets dknown, and also sets bknown for clerics.
        xnameFresh(otmp, state);
        // C ref: invent.c:2766 and addinv_core2(). A newly visible luckstone
        // recalculates luck; addinv_core2() also handles an Archeologist's
        // unknown scroll label immediately after xname() establishes dknown.
        if (otmp.otyp === LUCKSTONE
            || (otmp.oartifact && confers_luck(otmp, state)))
            set_moreluck(state);
        const effects = addinv_core2(
            otmp,
            {
                ...env,
                state,
                hooks: {
                    ...(env.hooks ?? {}),
                    message: env.hooks?.message ?? env.message
                        ?? (state === game ? ttyPline : async () => {}),
                },
            },
            { confersLuck: false },
        );
        if (isThenable(effects)) await effects;
    }
    if (invupdated)
        update_inventory({ ...env, state });
}

// C ref: invent.c update_inventory(). Calls before the move loop and while
// map output is suppressed are deliberately ignored. moveloop_preamble()
// owns the first live startup refresh.
export function update_inventory(env = {}) {
    const normalized = preflight_update_inventory(env);
    if (!inventoryRefreshActive(normalized)) return false;
    if (typeof normalized.hooks.updateInventory !== 'function') return false;
    normalized.state.iflags ??= {};
    const savedSuppressPrice = normalized.state.iflags.suppress_price;
    normalized.state.iflags.suppress_price = 0;
    try {
        normalized.hooks.updateInventory(normalized.state);
    } finally {
        normalized.state.iflags.suppress_price = savedSuppressPrice;
    }
    return true;
}

// C ref: invent.c doperminv() (2814-2857).  The recorder TTY build does not
// advertise WC_PERM_INVENT, while callers with a window-port test hook may
// provide the capability explicitly.  Keep the capability check before the
// option and empty-pack checks, exactly as C does.
export async function doperminv(state = game, hooks = {}) {
    const capability = Number(state.wincap ?? 0);
    const namedCapability = state.windowCapabilities instanceof Set
        && state.windowCapabilities.has('WC_PERM_INVENT');
    if (!(capability & WC_PERM_INVENT) && !namedCapability) {
        await ttyPline(
            `Persistent inventory display is not supported by '${
                state.windowportName ?? 'tty'
            }'.`,
            state,
        );
    } else if (!state.iflags?.perm_invent) {
        await ttyPline(
            "Persistent inventory ('perm_invent' option) is not presently enabled.",
            state,
        );
    } else if (!inventoryHead(state)) {
        await ttyPline('Persistent inventory display is empty.', state);
    } else if (typeof hooks.updateInventory === 'function') {
        hooks.updateInventory(1, state);
    } else if (typeof state.hooks?.updateInventory === 'function') {
        state.hooks.updateInventory(1, state);
    } else {
        // A capable interface owns the actual persistent window operation;
        // without one, leave the command at the same boundary after its
        // source capability checks.
        throw new UnsupportedObjectOperationError('win_update_inventory');
    }
    return ECMD_OK;
}

// C ref: invent.c find_unpaid() (3021-3043).  `lastFound` is the JavaScript
// equivalent of C's struct obj ** out-parameter: pass `{ value: object }` to
// continue after a previously returned unpaid object, or null/undefined to
// obtain the first unpaid object.  Containers are traversed before the next
// sibling, matching the recursive C call.
export function find_unpaid(list, lastFound = null) {
    const cursor = lastFound && typeof lastFound === 'object'
        && Object.hasOwn(lastFound, 'value') ? lastFound : null;
    let wanted = cursor ? cursor.value : null;
    const visit = (head) => {
        for (let object = head; object; object = object.nobj) {
            if (object.unpaid) {
                if (wanted) {
                    if (object === wanted) {
                        wanted = null;
                        if (cursor) cursor.value = null;
                    }
                } else {
                    if (cursor) cursor.value = object;
                    return object;
                }
            }
            if (object.cobj) {
                const found = visit(object.cobj);
                if (found) return found;
            }
        }
        return null;
    };
    return visit(list);
}

// C ref: invent.c free_pickinv_cache() (3044-3056).  The TTY renderer keeps
// no native menu window, but a capable embedding can supply the destructor;
// either way the cached handle is invalidated before the caller returns.
export function free_pickinv_cache(state = game, hooks = {}) {
    state.gc ??= {};
    const cached = state.gc.cached_pickinv_win;
    if (cached !== undefined && cached !== WIN_ERR) {
        const destroy = hooks.destroyNhwindow ?? hooks.destroyWindow
            ?? state.hooks?.destroyNhwindow ?? state.hooks?.destroyWindow;
        if (typeof destroy === 'function') destroy(cached, state);
        state.gc.cached_pickinv_win = WIN_ERR;
    } else if (cached === undefined) {
        state.gc.cached_pickinv_win = WIN_ERR;
    }
    return state.gc.cached_pickinv_win;
}

function inventoryHead(state) {
    return state.invent ?? null;
}

function setInventoryHead(state, head) {
    state.invent = head ?? null;
    return state.invent;
}

// The C global gi.invent is intentionally flattened to state.invent, matching
// the rest of this port's flattened instance-global state.
export function inventoryObjects(state = game) {
    const result = [];
    for (let obj = inventoryHead(state); obj; obj = obj.nobj)
        result.push(obj);
    return result;
}

// C ref: invent.c carrying() (1493-1504). "return inventory object of type
// 'type' if hero has one, otherwise Null". C returns the loop variable after
// the loop, so a run that finds nothing answers NULL through the same
// statement; this returns null explicitly.
//
// trap.c burnarmor() is the ported caller: it starts its wet-towel scan at the
// first towel and then walks the rest of the pack from there, so the returned
// object is a position in the list rather than only a hit.
export function carrying(type, state = game) {
    for (let obj = inventoryHead(state); obj; obj = obj.nobj)
        if (obj.otyp === type) return obj;
    return null;
}

// C ref: invent.c check_invent_gold() (4889-4913). Returns true when the
// inventory contains gold in an unexpected arrangement (multiple stacks or
// a stack in a slot other than '$'), which means gold should be allowed as
// a target for the #adjust command. In normal play this returns false.
export function check_invent_gold(why, state = game) {
    let goldstacks = 0;
    let wrongslot = 0;
    for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj) {
        if (otmp.oclass === COIN_CLASS) {
            goldstacks++;
            if (otmp.invlet !== GOLD_SYM) wrongslot++;
        }
    }
    if (goldstacks > 1 || wrongslot > 0) {
        // C's impossible() is diagnostic only and has no terminal output.
        // Keep the source dependency explicit while preserving its return.
        note_unported('pline.c impossible');
        return true;
    }
    return false;
}

export function initializeInventory(state = game) {
    if (inventoryHead(state)) {
        throw new Error(
            'initializeInventory requires an empty inventory; use resetInventory first',
        );
    }
    setInventoryHead(state, null);
    // C ref: u_init.c u_init_inventory_attrs(). 51 makes the first search
    // wrap around to inventory letter 'a'.
    state.lastinvnr = INVLET_BASIC - 1;
    return state;
}



function buriedObjectHead(state) {
    if (!state.level
        || !Object.hasOwn(state.level, 'buriedobjlist')) {
        throw new Error(
            'buried object operations require initialized level state',
        );
    }
    return state.level.buriedobjlist ?? null;
}

// A malformed chain is unreachable in C's normal lifecycle. Detect it before
// mutation so a JS integration error cannot orphan objects or loop forever.
function validateBuriedChain(state, target = null) {
    const seen = new Set();
    let found = target === null;
    for (let current = buriedObjectHead(state);
        current;
        current = current.nobj) {
        if (typeof current !== 'object' || seen.has(current))
            throw new Error('buried object chain is corrupt');
        seen.add(current);
        if (current.where !== OBJ_BURIED || current.nexthere)
            throw new Error('buried object chain has invalid ownership');
        if (current === target) found = true;
    }
    if (!found) {
        throw new Error(
            `buried object ${target?.o_id ?? '?'} is not on the level chain`,
        );
    }
}

// C ref: mkobj.c add_to_buried(). The caller owns ox/oy; this primitive only
// transfers a free object to the level-wide buried chain.
export function add_to_buried(obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (!obj || typeof obj !== 'object')
        throw new TypeError('add_to_buried requires an object');
    if (obj.where !== OBJ_FREE) {
        throw new Error(
            `add_to_buried: object where=${obj.where}, expected OBJ_FREE`,
        );
    }
    if (obj.nobj || obj.nexthere) {
        throw new Error('add_to_buried: free object retains a chain link');
    }
    validateBuriedChain(normalized.state);
    const head = buriedObjectHead(normalized.state);

    obj.where = OBJ_BURIED;
    obj.nobj = head;
    normalized.state.level.buriedobjlist = obj;
    return obj;
}

export function container_weight(container, env) {
    container.owt = weight(container, env);
    if (container.where === OBJ_CONTAINED && container.ocontainer)
        container_weight(container.ocontainer, env);
}

function preflightFreeinvCore(obj, env) {
    if (obj.oclass === COIN_CLASS) return { confersLuck: false };
    if (obj.otyp === AMULET_OF_YENDOR
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === BELL_OF_OPENING
        || obj.otyp === SPE_BOOK_OF_THE_DEAD
        || obj.oartifact) {
        requiredHook(env, 'removeSpecialInventoryEffects', obj);
    }
    let confersLuck = obj.otyp === LUCKSTONE;
    if (obj.oartifact && obj.otyp !== LUCKSTONE) {
        confersLuck = Boolean(
            requiredHook(env, 'artifactConfersLuck', obj)(obj, env),
        );
    }
    if (!confersLuck && obj.otyp === FIGURINE && obj.timed) {
        requiredHook(env, 'stopFigurineTimer', obj);
    }
    return { confersLuck };
}

function freeinv_core(obj, env, facts) {
    if (obj.oclass === COIN_CLASS) {
        env.state.disp ??= {};
        env.state.disp.botl = true;
        return;
    }
    if (obj.otyp === AMULET_OF_YENDOR
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === BELL_OF_OPENING
        || obj.otyp === SPE_BOOK_OF_THE_DEAD
        || obj.oartifact) {
        requiredHook(env, 'removeSpecialInventoryEffects', obj)(obj, env);
    }

    if (obj.otyp === LOADSTONE) {
        curseFreeObject(obj);
    } else if (obj.otyp === LUCKSTONE || obj.oartifact) {
        if (facts.confersLuck) {
            set_moreluck(env.state);
            env.state.disp ??= {};
            env.state.disp.botl = true;
        }
    } else if (obj.otyp === FIGURINE && obj.timed) {
        requiredHook(env, 'stopFigurineTimer', obj)(obj, env);
        if (obj.timed)
            throw new Error('stopFigurineTimer must clear obj.timed');
    }

    if (env.state.context?.tin?.tin === obj) {
        env.state.context.tin.tin = null;
        env.state.context.tin.o_id = 0;
    }
}

export function freeinv(obj, env = {}) {
    const normalized = inventoryEnv(env);
    requireInventoryRefresh(normalized);
    const facts = preflightFreeinvCore(obj, normalized);
    normalized.state.invent = extract_nobj(obj, inventoryHead(normalized.state));
    obj.pickup_prev = false;
    freeinv_core(obj, normalized, facts);
    update_inventory(normalized);
    return obj;
}

// Floor/migration owners stay outside this first substrate. A future level
// module supplies extractExternalObject; inventory, container, and monster
// chains are handled here without an adapter.
function projectedContents(head, replacedObject, replacement) {
    let projectedHead = null;
    let projectedTail = null;
    let found = false;
    for (let current = head; current; current = current.nobj) {
        let projected;
        if (current === replacedObject) {
            found = true;
            if (!replacement) continue;
            projected = replacement;
        } else {
            projected = { ...current };
        }
        projected.nobj = null;
        if (projectedTail) projectedTail.nobj = projected;
        else projectedHead = projected;
        projectedTail = projected;
    }
    return { found, head: projectedHead };
}

function preflightContainedExtraction(obj, env) {
    let container = obj.ocontainer;
    if (!container) {
        throw new Error(
            'obj_extract_self: contained object has no container',
        );
    }

    // Build a read-only projection of the outer container tree after obj has
    // been removed. This checks siblings and ancestors without requiring
    // dependencies which belong only to the departing object.
    let replacedObject = obj;
    let replacement = null;
    while (container) {
        const contents = projectedContents(
            container.cobj,
            replacedObject,
            replacement,
        );
        if (!contents.found)
            throw new Error('obj_extract_self: object is not in its container');
        replacement = { ...container, cobj: contents.head, nobj: null };
        if (container.where !== OBJ_CONTAINED) break;
        replacedObject = container;
        container = container.ocontainer;
        if (!container) {
            throw new Error(
                'obj_extract_self: contained container has no parent',
            );
        }
    }
    preflightWeight(replacement, env);
}

function preflightObjectExtraction(obj, env) {
    switch (obj.where) {
    case OBJ_CONTAINED:
        preflightContainedExtraction(obj, env);
        break;
    case OBJ_INVENT:
        requireInventoryRefresh(env);
        preflightFreeinvCore(obj, env);
        break;
    case OBJ_FLOOR:
    case OBJ_MIGRATING:
        requiredHook(env, 'extractExternalObject', obj);
        break;
    case OBJ_ONBILL:
        break; // obj_extract_self owns the gb.billobjs chain below.
    case OBJ_BURIED:
        validateBuriedChain(env.state, obj);
        break;
    default:
        break;
    }
}

export function obj_extract_self(obj, env = {}) {
    const normalized = inventoryEnv(env);
    preflightObjectExtraction(obj, normalized);
    switch (obj.where) {
    case OBJ_FREE:
        if (obj.nobj || obj.nexthere)
            throw new Error('obj_extract_self: free object retains a chain link');
        return obj;
    case OBJ_LUAFREE:
    case OBJ_DELETED:
        return obj;
    case OBJ_CONTAINED: {
        const container = obj.ocontainer;
        if (!container)
            throw new Error('obj_extract_self: contained object has no container');
        container.cobj = extract_nobj(obj, container.cobj);
        obj.ocontainer = null;
        container_weight(container, normalized);
        return obj;
    }
    case OBJ_INVENT:
        return freeinv(obj, normalized);
    case OBJ_MINVENT:
        if (!obj.ocarry)
            throw new Error('obj_extract_self: monster object has no carrier');
        obj.ocarry.minvent = extract_nobj(obj, obj.ocarry.minvent);
        obj.ocarry = null;
        return obj;
    case OBJ_BURIED:
        normalized.state.level.buriedobjlist = extract_nobj(
            obj,
            buriedObjectHead(normalized.state),
        );
        return obj;
    case OBJ_FLOOR:
    case OBJ_MIGRATING:
        requiredHook(normalized, 'extractExternalObject', obj)(obj, normalized);
        if (obj.where !== OBJ_FREE)
            throw new Error('extractExternalObject must leave object OBJ_FREE');
        if (obj.nobj || obj.nexthere) {
            throw new Error(
                'extractExternalObject must clear object chain links',
            );
        }
        return obj;
    case OBJ_ONBILL:
        normalized.state.gb.billobjs = extract_nobj(
            obj, normalized.state.gb.billobjs,
        );
        return obj;
    default:
        throw new RangeError(`obj_extract_self: invalid where=${obj.where}`);
    }
}

// C ref: invent.c delobj() (1428-1433). "normal object deletion (if unpaid, it
// remains on the bill)".
export function delobj(obj, env = {}) {
    delobj_core(obj, false, env);
}

// C ref: invent.c delallobj() (1405-1426).  Deleting the ball can rewrite the
// punishment chain, so the next floor link is read only after unpunish(), just
// as in C.  A drawbridge leaves the chain itself behind while deleting every
// other object at the square.
export function delallobj(x, y, env = {}) {
    const normalized = inventoryEnv(env);
    const { state } = normalized;
    let obj = state.level?.objects?.[x]?.[y] ?? null;
    while (obj) {
        if (obj === state.uball) {
            requiredHook(normalized, 'unpunish', obj)(normalized);
        }
        const next = obj.nexthere;
        if (obj !== state.uchain)
            delobj(obj, normalized);
        obj = next;
    }
}

// C ref: invent.c delobj_core() (1435-1462). `force` is TRUE only when
// reviving a Rider corpse, so every call this port makes passes FALSE and
// spends zap.c obj_resists()'s rn2(100) before deleting anything.
export function delobj_core(obj, force, env = {}) {
    const normalized = inventoryEnv(env);
    /* "obj_resists(obj,0,0) protects the Amulet, the invocation tools,
        and Rider corpses" */
    if (!force && obj_resists(obj, 0, 0, normalized)) {
        obj.in_use = 0; /* "in case caller has set this to 1" */
        return;
    }
    const update_map = (obj.where === OBJ_FLOOR);
    obj_extract_self(obj, normalized);
    if (update_map) {
        /* "floor object's coordinates are always up to date" */
        maybe_unhide_at(obj.ox, obj.oy, normalized.state);
        // No test distinguishes this call from its absence: the port paints
        // the map from level state at the next flush, so the square a floor
        // delete vacated is already redrawn by the time any screen is
        // compared. It is here because C draws it here.
        const redraw = normalized.redraw ?? newsym;
        redraw(obj.ox, obj.oy);
    }
    obfree(obj, null, normalized); /* "frees contents also" */
}

// C ref: invent.c useupf() (4760-4783). "uses up an object that's on the
// floor, charging for it as necessary".
//
// The shop and concealment helpers called here belong to other source files.
// Their return values are discarded by C, so this owner records those gaps and
// continues through the deletion boundary instead of refusing the whole use.
export async function useupf(obj, numused, env = {}) {
    const normalized = inventoryEnv(env);
    const state = normalized.state;
    const at_u = u_at(obj.ox, obj.oy, state);

    /* "burn_floor_objects() keeps an object pointer that it tries to
     * useupf() multiple times, so obj must survive if plural" */
    const otmp = (obj.quan > numused)
        ? splitobj(obj, numused, normalized)
        : obj;
    if (!state.context?.mon_moving && costly_spot(otmp.ox, otmp.oy, state)) {
        const room = in_rooms(otmp.ox, otmp.oy, 0, state)[0] ?? 0;
        if ((state.u?.urooms ?? []).includes(room))
            await addtobill(otmp, false, false, false, state, normalized);
        else
            note_unported('shk.c stolen_value');
    }
    delobj(otmp, normalized);
    if (at_u && state.u.uundetected && hides_under(state.youmonst?.data))
        note_unported('mon.c hideunder');
}

function hasTextExtra(obj, field) {
    return obj.oextra?.[field] != null && obj.oextra[field] !== '';
}

function oname(obj) {
    return hasTextExtra(obj, 'oname') ? String(obj.oextra.oname) : '';
}

function isBlind(env) {
    const property = env.state.u?.uprops?.[BLINDED];
    if (!property)
        throw new Error('Blind requires initialized u.uprops');
    return Boolean((property.intrinsic || property.extrinsic)
        && !property.blocked);
}

// C's `Fumbling`, which reads u.uprops[FUMBLING] the way the property macros
// in youprop.h do.  Nothing in this port raises it.
function propertyPresent(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function isHallucinating(env) {
    const hallucination = env.state.u?.uprops?.[HALLUC];
    const resistance = env.state.u?.uprops?.[HALLUC_RES];
    if (!hallucination || !resistance)
        throw new Error('Hallucination requires initialized u.uprops');
    return Boolean(hallucination.intrinsic
        && !(resistance.intrinsic || resistance.extrinsic));
}

function isCleric(state) {
    return state.urole?.filecode === 'Pri';
}

// C ref: invent.c mergable(). Checks whose answer depends on unported shops or
// monsters require a hook at the point where that dependency becomes live.
export function mergable(otmp, obj, env = {}) {
    const normalized = inventoryEnv(env);
    const type = objectType(obj, normalized.state);
    if (obj === otmp
        || obj.otyp !== otmp.otyp
        || obj.nomerge
        || otmp.nomerge
        || !type.oc_merge) {
        return false;
    }
    if (obj.oclass === COIN_CLASS) return true;
    if (Boolean(obj.cursed) !== Boolean(otmp.cursed)
        || Boolean(obj.blessed) !== Boolean(otmp.blessed)) {
        return false;
    }
    if (obj.how_lost === LOST_EXPLODING
        || otmp.how_lost === LOST_EXPLODING) {
        return false;
    }
    if (otmp.how_lost !== LOST_NONE && obj.how_lost !== otmp.how_lost)
        return false;
    if (obj.globby) return true;

    if (Boolean(obj.unpaid) !== Boolean(otmp.unpaid)
        || obj.spe !== otmp.spe
        || Boolean(obj.no_charge) !== Boolean(otmp.no_charge)
        || Boolean(obj.obroken) !== Boolean(otmp.obroken)
        || Boolean(obj.otrapped) !== Boolean(otmp.otrapped)
        || Boolean(obj.lamplit) !== Boolean(otmp.lamplit)) {
        return false;
    }
    if (obj.oclass === FOOD_CLASS
        && (obj.oeaten !== otmp.oeaten || obj.orotten !== otmp.orotten)) {
        return false;
    }

    let perceptionBlocksComparison;
    const blindOrHallucinating = () => {
        if (perceptionBlocksComparison === undefined) {
            perceptionBlocksComparison = isBlind(normalized)
                || isHallucinating(normalized);
        }
        return perceptionBlocksComparison;
    };
    if (Boolean(obj.dknown) !== Boolean(otmp.dknown)
        || (Boolean(obj.bknown) !== Boolean(otmp.bknown)
            && !isCleric(normalized.state)
            && blindOrHallucinating())
        || obj.oeroded !== otmp.oeroded
        || obj.oeroded2 !== otmp.oeroded2
        || Boolean(obj.greased) !== Boolean(otmp.greased)) {
        return false;
    }
    if (erosionMatters(obj, normalized.state)
        && (Boolean(obj.oerodeproof) !== Boolean(otmp.oerodeproof)
            || (Boolean(obj.rknown) !== Boolean(otmp.rknown)
                && blindOrHallucinating()))) {
        return false;
    }

    if (obj.otyp === CORPSE || obj.otyp === EGG || obj.otyp === TIN) {
        if (obj.corpsenm !== otmp.corpsenm) return false;
    }
    if (obj.otyp === EGG && (obj.timed || otmp.timed)) return false;
    if (obj.otyp === CORPSE && otmp.corpsenm >= LOW_PM) {
        const isReviver = requiredHook(normalized, 'isReviver', otmp);
        if (isReviver(otmp.corpsenm, normalized)) return false;
    }
    if (isCandle(obj)
        && Math.trunc(obj.age / 25) !== Math.trunc(otmp.age / 25)) {
        return false;
    }
    if (obj.otyp === POT_OIL && obj.lamplit) return false;
    if (obj.unpaid) {
        const samePrice = normalized.hooks?.samePrice
            ?? ((first, second, env) => same_price(first, second, env.state));
        if (!samePrice(obj, otmp, normalized)) return false;
    }
    if (obj.oextra?.omonst
        || obj.oextra?.omid
        || otmp.oextra?.omonst
        || otmp.oextra?.omid) {
        return false;
    }

    const objName = oname(obj);
    const targetName = oname(otmp);
    if ((objName.length !== targetName.length
         && ((objName.length && targetName.length) || obj.otyp === CORPSE))
        || (objName && targetName && objName !== targetName)) {
        return false;
    }
    const objMail = hasTextExtra(obj, 'omailcmd') ? String(obj.oextra.omailcmd) : '';
    const targetMail = hasTextExtra(otmp, 'omailcmd')
        ? String(otmp.oextra.omailcmd)
        : '';
    if (objMail !== targetMail) return false;
    if (obj.otyp === SCR_MAIL
        && obj.spe > 0
        && obj.o_id % 2 !== otmp.o_id % 2) {
        return false;
    }
    if (obj.oartifact !== otmp.oartifact) return false;
    if (Boolean(obj.known) !== Boolean(otmp.known)
        && blindOrHallucinating()) {
        return false;
    }
    return true;
}

// C ref: invent.c merge_choice() (775-807). Find an inventory object that
// can merge with `obj`, accounting for the attributes a shop-floor object
// will have after pickup. The temporary no_charge write is restored on every
// path that reaches the scan; the early billable-shop return leaves it alone,
// matching the source's branch order.
export function merge_choice(objlist, obj, state = game) {
    if (!objlist) return null;
    if (obj.otyp === SCR_SCARE_MONSTER) return null;

    const saveNoCharge = obj.no_charge;
    if (objlist === state.invent && obj.where === OBJ_FLOOR) {
        const shopkeeper = shop_keeper(
            inside_shop(obj.ox, obj.oy, state),
            state,
        );
        if (shopkeeper) {
            if (obj.no_charge) {
                obj.no_charge = false;
            } else if (inhishop(shopkeeper, state)) {
                return null;
            }
        }
    }

    let current = objlist;
    while (current && !mergable(current, obj, { state }))
        current = current.nobj;
    obj.no_charge = saveNoCharge;
    return current ?? null;
}

function stopObjectTimers(obj, env) {
    requiredHook(env, 'stopObjectTimers', obj)(obj, env);
    if (obj.timed)
        throw new Error('stopObjectTimers must clear obj.timed');
}

function oidPriceAdjustment(obj, oid, state) {
    const type = objectType(obj, state);
    const canVary = !(obj.dknown && type.oc_name_known)
        && (obj.oclass !== GEM_CLASS || type.oc_material !== GLASS);
    return canVary && oid % 4 === 0 ? 1 : 0;
}

function preflightObfree(obj, merge, env) {
    if (obj.otyp === LEASH && obj.leashmon)
        requiredHook(env, 'unleashObject', obj);
    // useupall() runs freeinv_core() first, which stops a carried figurine's
    // transform timer before obfree() reaches deallocation.
    const timerStopsDuringFreeinv = obj.where === OBJ_INVENT
        && obj.otyp === FIGURINE;
    if (obj.timed && !timerStopsDuringFreeinv)
        requiredHook(env, 'stopObjectTimers', obj);
    if (obj.lamplit && !merge)
        requiredHook(env, 'deleteObjectLightSource', obj);
    if (obj.owornmask && !(merge && merge.where === OBJ_INVENT))
        requiredHook(env, 'setNotWorn', obj);
    if (isContainer(obj)) {
        const lock = env.state.xlock ?? env.state.context?.xlock;
        if (lock?.box === obj) requiredHook(env, 'resetPick', obj);
    }
    for (let contents = obj.cobj; contents; contents = contents.nobj)
        preflightObfree(contents, null, env);
}

// Dependency-only half of shk.c obfree().  Callers such as burial extract an
// object before freeing it, so they must be able to resolve every downstream
// lifecycle owner while the original floor chains are still intact.
export function preflight_obfree(obj, merge = null, env = {}) {
    const normalized = inventoryEnv(env);
    preflightObfree(obj, merge, normalized);
    return normalized;
}

function comparisonWillDiscover(otmp, obj, state) {
    const targetBknown = otmp.oclass === COIN_CLASS ? false : otmp.bknown;
    return Boolean(obj.known) !== Boolean(otmp.known)
        || (Boolean(obj.rknown) !== Boolean(otmp.rknown)
            && Boolean(otmp.oerodeproof))
        || (Boolean(obj.bknown) !== Boolean(targetBknown)
            && !isCleric(state));
}

// C ref: shk.c obfree(). The bill-entry branch lives in shk.js; ownership
// cleanup uses the same lifecycle operations as ordinary inventory objects.
export function obfree(obj, merge = null, rawEnv = {}) {
    const env = inventoryEnv(rawEnv);
    preflightObfree(obj, merge, env);
    if (obj.otyp === LEASH && obj.leashmon)
        requiredHook(env, 'unleashObject', obj)(obj, env);

    if (obj.oclass === FOOD_CLASS) {
        // C ref: eat.c food_disappears(), obfree()'s only caller. Its victual
        // half lives in js/eat.js, which owns svc.context.victual; its
        // obj_stop_timers() half stays here, where the timer hook resolves.
        food_disappears(obj, env.state);
        if (obj.timed) stopObjectTimers(obj, env);
    }
    if (obj.oclass === SPBOOK_CLASS
        && env.state.context?.spbook?.book === obj) {
        env.state.context.spbook.book = null;
        env.state.context.spbook.o_id = 0;
    }
    if (obj.cobj) delete_contents(obj, env);
    if (isContainer(obj)) {
        const lock = env.state.xlock ?? env.state.context?.xlock;
        if (lock?.box === obj)
            requiredHook(env, 'resetPick', obj)(obj, env);
    }
    if (obj.otyp === BOULDER) obj.next_boulder = 0;

    let shopDisposition = null;
    if (obj.unpaid || merge?.unpaid || obj.where === OBJ_ONBILL) {
        const disposition = (env.hooks.obfreeShopBill ?? obfree_shop_bill)(
            obj,
            merge,
            env,
        );
        if (disposition === 'preserved') return;
        if (disposition === 'retained') {
            if (merge)
                throw new Error('obfreeShopBill cannot retain a merged object');
            if (obj.where !== OBJ_ONBILL) {
                throw new Error(
                    'obfreeShopBill retained object must be on the bill chain',
                );
            }
            return;
        }
        if (disposition === 'billed' && !merge) {
            throw new Error('obfreeShopBill billed disposition requires merge');
        }
        if (disposition !== 'billed' && disposition !== 'unbilled') {
            throw new Error(
                'obfreeShopBill must return retained, billed, or unbilled',
            );
        }
        shopDisposition = disposition;
    }
    if (merge
        && shopDisposition !== 'billed'
        && oidPriceAdjustment(obj, obj.o_id, env.state)
            > oidPriceAdjustment(merge, merge.o_id, env.state)) {
        merge.o_id = obj.o_id;
    }

    if (obj.owornmask) {
        requiredHook(env, 'setNotWorn', obj)(obj, env);
        if (obj.owornmask)
            throw new Error('setNotWorn must clear owornmask');
    }
    dealloc_obj(obj, env);
}

// Mutation prefix of invent.c merged(), through the point immediately before
// its comparison-discovery pline().  The live pickup path can suspend at that
// call boundary before obfree() deletes the incoming object.
function beginMerged(otmp, obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (!preflightMerged(otmp, obj, normalized)) return null;

    if (!obj.lamplit && !obj.globby) {
        obj.age = Math.trunc(obj.age);
        otmp.age = Math.trunc(
            (otmp.age * otmp.quan + obj.age * obj.quan)
            / (otmp.quan + obj.quan),
        );
    }
    if (!otmp.globby) otmp.quan += obj.quan;
    if (otmp.oclass === COIN_CLASS) {
        otmp.owt = weight(otmp, normalized);
        otmp.bknown = false;
    } else if (!isPudding(otmp)) {
        otmp.owt = weight(otmp, normalized);
    }

    if (!oname(otmp) && oname(obj)) {
        otmp.oextra ??= {};
        otmp.oextra.oname = obj.oextra.oname;
    }
    obj_extract_self(obj, normalized);
    if (obj.pickup_prev && otmp.where === OBJ_INVENT)
        otmp.pickup_prev = true;

    if (obj.lamplit) {
        requiredHook(normalized, 'mergeLightSources', obj)(obj, otmp, normalized);
        obj.lamplit = false;
    }
    if (obj.timed) stopObjectTimers(obj, normalized);

    let discovered = false;
    if (Boolean(obj.known) !== Boolean(otmp.known)) {
        otmp.known = true;
        discovered = true;
    }
    if (Boolean(obj.rknown) !== Boolean(otmp.rknown)) {
        otmp.rknown = true;
        if (otmp.oerodeproof) discovered = true;
    }
    if (Boolean(obj.bknown) !== Boolean(otmp.bknown)) {
        otmp.bknown = true;
        if (!isCleric(normalized.state)) discovered = true;
    }

    if (obj.owornmask && otmp.where === OBJ_INVENT) {
        requiredHook(normalized, 'mergeWornMasks', obj)(otmp, obj, normalized);
        if (obj.owornmask)
            throw new Error('mergeWornMasks must clear incoming owornmask');
    }
    if (obj.bypass) otmp.bypass = true;
    if (obj.globby) {
        requiredHook(normalized, 'absorbGlob', obj)(otmp, obj, normalized);
        const absorbed = obj.where === OBJ_DELETED || obj.where === OBJ_LUAFREE;
        if (!absorbed || obj.nobj || obj.nexthere || obj.cobj) {
            throw new Error(
                'absorbGlob must deallocate the absorbed object',
            );
        }
        if (otmp.where === OBJ_DELETED || otmp.where === OBJ_LUAFREE)
            throw new Error('absorbGlob must preserve the target object');
        return { normalized, target: otmp, object: null };
    }
    const comparisonDiscovered = discovered
        && otmp.where === OBJ_INVENT
        && obj.how_lost !== LOST_THROWN
        && otmp.how_lost !== LOST_THROWN;
    return {
        comparisonDiscovered,
        normalized,
        target: otmp,
        object: obj,
    };
}

function finishMerged(plan) {
    if (plan.object)
        obfree(plan.object, plan.target, plan.normalized);
    return true;
}

function isThenable(value) {
    return typeof value?.then === 'function';
}

// C ref: invent.c merged(). Returns true when `obj` was absorbed into otmp.
export function merged(otmp, obj, env = {}) {
    const plan = beginMerged(otmp, obj, env);
    if (!plan) return false;
    if (plan.comparisonDiscovered) {
        requiredHook(
            plan.normalized,
            'inventoryComparisonDiscovered',
            plan.target,
        )(plan.target, plan.normalized);
    }
    return finishMerged(plan);
}

// Runtime counterpart of merged().  ttyPline() can wait for --More--, and C
// does not execute obfree() until that wait has finished.  Non-waiting merges
// still complete synchronously so merely scanning incompatible stacks cannot
// introduce an observable scheduling boundary.
export function mergedRuntime(otmp, obj, env = {}) {
    const plan = beginMerged(otmp, obj, env);
    if (!plan) return false;
    if (plan.comparisonDiscovered) {
        const wait = requiredHook(
            plan.normalized,
            'inventoryComparisonDiscovered',
            plan.target,
        )(plan.target, plan.normalized);
        if (isThenable(wait)) {
            return Promise.resolve(wait).then(() => finishMerged(plan));
        }
    }
    return finishMerged(plan);
}

// Dependency-only prefix of invent.c merged().  Pickup plans an entire
// selected floor sequence before observing or unlinking its first object, so
// the merge target can be the projected result of an earlier selection.
function preflightMerged(otmp, obj, normalized) {
    if (!mergable(otmp, obj, normalized)) return false;
    if (obj.lamplit) requiredHook(normalized, 'mergeLightSources', obj);
    if (obj.timed) requiredHook(normalized, 'stopObjectTimers', obj);
    if (obj.owornmask && otmp.where === OBJ_INVENT)
        requiredHook(normalized, 'mergeWornMasks', obj);
    if (obj.globby) requiredHook(normalized, 'absorbGlob', obj);
    if (!obj.globby
        && comparisonWillDiscover(otmp, obj, normalized.state)
        && otmp.where === OBJ_INVENT
        && obj.how_lost !== LOST_THROWN
        && otmp.how_lost !== LOST_THROWN) {
        requiredHook(normalized, 'inventoryComparisonDiscovered', otmp);
    }
    preflightObjectExtraction(obj, normalized);
    if (!obj.globby) preflightObfree(obj, otmp, normalized);
    if (otmp.oclass === COIN_CLASS || !isPudding(otmp))
        preflightWeight(otmp, normalized);
    return true;
}

// C ref: invent.c stackobj(). Preserve the newly placed object by merging an
// older compatible pile member into it, which is the pointer order used by C.
export function stackobj(obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (!obj || typeof obj !== 'object')
        throw new TypeError('stackobj requires an object');
    const pile = normalized.state.level?.objects?.[obj.ox]?.[obj.oy];
    if (obj.where === OBJ_FLOOR && !pile)
        throw new Error('stackobj: object is not on its floor pile');
    if (obj.where === OBJ_FLOOR) {
        let linked = false;
        for (let current = pile; current; current = current.nexthere) {
            if (current === obj) {
                linked = true;
                break;
            }
        }
        if (!linked)
            throw new Error('stackobj: object is not on its floor pile');
    }
    // sp_lev.c also calls stackobj() after putting a direct custom-inventory
    // object into OBJ_MINVENT (or after mpickobj merged and deleted it).  C
    // simply scans the remembered coordinate's floor pile in every case.
    for (let current = pile; current; current = current.nexthere) {
        if (current !== obj && merged(obj, current, normalized)) break;
    }
    return obj;
}

// C ref: shk.c delete_contents(). Preflight the whole sibling chain before
// extracting any child, so a missing lifecycle dependency cannot partially
// destroy a container.  Extraction then updates ownership and weight at the
// same source boundary as C.
export function delete_contents(container, env = {}) {
    const normalized = inventoryEnv(env);
    for (let current = container?.cobj ?? null;
        current;
        current = current.nobj) {
        preflightObjectExtraction(current, normalized);
        preflightObfree(current, null, normalized);
    }
    while (container?.cobj) {
        const current = container.cobj;
        obj_extract_self(current, normalized);
        obfree(current, null, normalized);
    }
    return container;
}

function inventoryIndex(invlet) {
    if (typeof invlet !== 'string' || invlet.length !== 1) return -1;
    const code = invlet.charCodeAt(0);
    if (code >= 97 && code <= 122) return code - 97;
    if (code >= 65 && code <= 90) return code - 65 + 26;
    return -1;
}

function inventoryLetter(index) {
    return index < 26
        ? String.fromCharCode(97 + index)
        : String.fromCharCode(65 + index - 26);
}

// C ref: invent.c assigninvlet().
export function assigninvlet(obj, state = game) {
    if (obj.oclass === COIN_CLASS) {
        obj.invlet = '$';
        return obj.invlet;
    }
    const inUse = new Array(INVLET_BASIC).fill(false);
    for (let current = inventoryHead(state); current; current = current.nobj) {
        if (current === obj) continue;
        const index = inventoryIndex(current.invlet);
        if (index >= 0) inUse[index] = true;
        if (current.invlet === obj.invlet) obj.invlet = '';
    }
    let index = inventoryIndex(obj.invlet);
    if (index >= 0) return obj.invlet;

    const previous = Number.isInteger(state.lastinvnr)
        ? state.lastinvnr
        : INVLET_BASIC - 1;
    for (index = previous + 1; index !== previous; ++index) {
        if (index === INVLET_BASIC) {
            index = -1;
            continue;
        }
        if (!inUse[index]) break;
    }
    obj.invlet = inUse[index] ? NOINVSYM : inventoryLetter(index);
    state.lastinvnr = index;
    return obj.invlet;
}

// C ref: invent.c reorder_invent() (739-774). The XOR is the source's
// inv_rank macro, including its value for an empty inventory letter.
function reorder_invent(state) {
    const rank = (obj) => {
        const code = typeof obj.invlet === 'string'
            && obj.invlet.length > 0
            ? obj.invlet.charCodeAt(0) : 0;
        return code ^ 0o40;
    };
    let needsSorting;
    do {
        needsSorting = false;
        let previous = null;
        let current = inventoryHead(state);
        while (current) {
            const next = current.nobj;
            if (next && rank(next) < rank(current)) {
                needsSorting = true;
                if (previous) previous.nobj = next;
                else setInventoryHead(state, next);
                current.nobj = next.nobj;
                next.nobj = current;
                previous = next;
            } else {
                previous = current;
                current = next;
            }
        }
    } while (needsSorting);
}

function resetJustPicked(head) {
    for (let obj = head; obj; obj = obj.nobj)
        obj.pickup_prev = false;
}

function clearContainedNoCharge(container) {
    picked_container(container);
}

function specialPrize(obj, state) {
    const achieveo = state.context?.achieveo;
    if (!achieveo) return null;
    // Prize ids use zero as their inactive sentinel.  Live object ids are
    // nonzero, so make that invariant explicit for hand-built JS objects too.
    if (achieveo.mines_prize_oid
        && obj.o_id === achieveo.mines_prize_oid) {
        return {
            achievement: ACH_MINE_PRIZE,
            oidField: 'mines_prize_oid',
        };
    }
    if (achieveo.soko_prize_oid
        && obj.o_id === achieveo.soko_prize_oid) {
        return {
            achievement: ACH_SOKO_PRIZE,
            oidField: 'soko_prize_oid',
        };
    }
    return null;
}

function addinv_core1(obj, env, facts) {
    const { state } = env;
    if (obj.oclass === COIN_CLASS) {
        state.disp ??= {};
        state.disp.botl = true;
    } else if (obj.otyp === AMULET_OF_YENDOR) {
        if (state.u.uhave?.amulet)
            note_unported('pline.c impossible');
        state.u.uhave.amulet = 1;
        record_achievement(ACH_AMUL, state);
    } else if (obj.otyp === CANDELABRUM_OF_INVOCATION) {
        if (state.u.uhave?.menorah)
            note_unported('pline.c impossible');
        state.u.uhave.menorah = 1;
        record_achievement(ACH_CNDL, state);
    } else if (obj.otyp === BELL_OF_OPENING) {
        if (state.u.uhave?.bell)
            note_unported('pline.c impossible');
        state.u.uhave.bell = 1;
        record_achievement(ACH_BELL, state);
    } else if (obj.otyp === SPE_BOOK_OF_THE_DEAD) {
        if (state.u.uhave?.book)
            note_unported('pline.c impossible');
        state.u.uhave.book = 1;
        record_achievement(ACH_BOOK, state);
    } else if (obj.oartifact) {
        if (is_quest_artifact(obj, state)) {
            if (state.u.uhave?.questart)
                note_unported('pline.c impossible');
            state.u.uhave.questart = 1;
            // quest.c artitouch() has no return value; its pager, discovery,
            // quest-status, and exercise effects remain an explicit gap.
            note_unported('quest.c artitouch');
        }
        set_artifact_intrinsic(obj, true, W_ART, state);
    }

    // C ref: invent.c addinv_core1().  Special-level creation sets nomerge
    // only until the tracked prize reaches the hero's inventory. The source
    // calls record_achievement() directly before clearing the tracking id.
    if (facts.prize) {
        record_achievement(facts.prize.achievement, state);
        state.context.achieveo[facts.prize.oidField] = 0;
        obj.nomerge = false;
    }
}

function preflightAddinvCores(obj, env) {
    const prize = specialPrize(obj, env.state);
    const confersLuck = obj.otyp === LUCKSTONE
        || (Boolean(obj.oartifact) && confers_luck(obj, env.state));
    return { confersLuck, prize };
}

function addinv_core2(obj, env, facts) {
    if (obj.otyp === LUCKSTONE || obj.oartifact) {
        if (facts.confersLuck)
            set_moreluck(env.state);
    }

    // C exposes the scroll label only after the object has entered the
    // inventory.  observe_object() precedes the message and makeknown(), so a
    // later naming/display call sees the same dknown and discovery state.
    if (env.state.urole?.filecode === 'Arc'
        && obj.oclass === SCROLL_CLASS
        && obj.otyp !== SCR_BLANK_PAPER
        && !isBlind(env)
        && !objectType(obj, env.state).oc_name_known) {
        observe_object(obj, env.state);
        const message = env.hooks?.message ?? env.message;
        let output = null;
        if (typeof message === 'function') {
            output = message(
                `You decipher the label on ${yname(obj, env.state)}.`,
                env.state,
            );
        } else {
            // The synchronous startup addinv() API has no message owner. C's
            // pline result is discarded here; runtime pickup supplies the
            // asynchronous owner and completes this arm below.
            note_unported('invent.c addinv_core2 pline');
        }
        const finishDiscovery = () => {
            discover_object(
                obj.otyp,
                true,
                true,
                true,
                env.state,
                // Preserve the caller's actual display and inventory hooks;
                // C makeknown() lets discover_object() perform its own live
                // update_inventory() call instead of replacing that owner
                // with a silent no-op.
                env,
            );
            env.state.u.uconduct ??= {};
            if (!env.state.u.uconduct.literate++)
                livelog_printf(
                    LL_CONDUCT,
                    'became literate by deciphering a scroll label',
                    env.state,
                );
        };
        if (isThenable(output)) return Promise.resolve(output).then(finishDiscovery);
        finishDiscovery();
    }
}

// C ref: invent.c's in-place poly_obj() sequence (1904-1913). The object
// chain has already been swapped by obj.replace_object(); these helpers retain
// the source order for the hero's intrinsic removal and addition without
// extracting the replacement a second time. addinv_core2() may wait for the
// Archeologist's label message, so callers must consume this return value.
export function replace_inventory_core(obj, replacement, env = {}) {
    const normalized = inventoryEnv(env);
    requireInventoryRefresh(normalized);
    const freeFacts = preflightFreeinvCore(obj, normalized);
    const addFacts = preflightAddinvCores(replacement, normalized);
    freeinv_core(obj, normalized, freeFacts);
    addinv_core1(replacement, normalized, addFacts);
    const effects = addinv_core2(replacement, normalized, addFacts);
    if (isThenable(effects))
        return Promise.resolve(effects).then(() => replacement);
    return replacement;
}

function runCarryObjEffects(obj, env, shouldAttachFigurineTimer) {
    if (shouldAttachFigurineTimer) {
        requiredHook(env, 'attachFigurineTimer', obj)(obj, env);
        if (obj.timed !== 1)
            throw new Error('attachFigurineTimer must leave one object timer');
    }
}

// Dependency-only half of invent.c:carry_obj_effects(). Object-transfer
// callers use this before unlinking a floor object so a missing timer or
// species boundary cannot leave ownership half-changed.
export function preflight_carry_obj_effects(obj, env = {}) {
    const normalized = inventoryEnv(env);
    let shouldAttachFigurineTimer = false;
    if (obj.otyp === FIGURINE
        && obj.cursed
        && obj.corpsenm !== NON_PM) {
        shouldAttachFigurineTimer = !requiredHook(
            normalized,
            'isDeadSpecies',
            obj,
        )(obj.corpsenm, true, normalized);
        if (shouldAttachFigurineTimer)
            requiredHook(normalized, 'attachFigurineTimer', obj);
    }
    return { normalized, shouldAttachFigurineTimer };
}

// C ref: invent.c carry_obj_effects().
export function carry_obj_effects(obj, env = {}, prepared = null) {
    const plan = prepared ?? preflight_carry_obj_effects(obj, env);
    runCarryObjEffects(
        obj,
        plan.normalized,
        plan.shouldAttachFigurineTimer,
    );
    return obj;
}

// C ref: dothrow.c throwing_weapon().  obj.h is_blade() and is_sword() are
// not ported, so their two terms stay inlined here; is_missile() and
// is_spear() come from js/obj.js, which owns obj.h.
export function isThrowingWeapon(obj, state) {
    const type = objectType(obj, state);
    const skill = type.oc_subtyp;
    const missile = is_missile(obj, state);
    const spear = is_spear(obj, state);
    const blade = obj.oclass === WEAPON_CLASS
        && skill >= P_DAGGER
        && skill <= P_SABER;
    const sword = obj.oclass === WEAPON_CLASS
        && skill >= P_SHORT_SWORD
        && skill <= P_SABER;
    return missile
        || spear
        || (blade && !sword && Boolean(type.oc_dir & PIERCE))
        || obj.otyp === WAR_HAMMER
        || obj.otyp === AKLYS;
}

function shouldAutoquiver(obj, state) {
    return obj.oartifact !== ART_MJOLLNIR
        && obj.otyp !== AKLYS
        && (isThrowingWeapon(obj, state) || is_ammo(obj, state));
}

function setQuiver(obj, env) {
    if (env.state.uquiver)
        env.state.uquiver.owornmask &= ~W_QUIVER;
    env.state.uquiver = obj;
    obj.owornmask |= W_QUIVER;
    update_inventory(env);
}

// Dependency-only half of invent.c addinv_core0(). Transfer callers use this
// while an object still belongs to its source chain so every missing inventory
// effect is rejected before ownership changes. The returned plan is bound to
// that exact object and normalized state, and one addinv() commit consumes it.
export function preflight_addinv(obj, env = {}) {
    const normalized = inventoryEnv(env);
    requireInventoryRefresh(normalized);
    return {
        object: obj,
        normalized,
        addinvFacts: preflightAddinvCores(obj, normalized),
        carryEffects: preflight_carry_obj_effects(obj, normalized),
        consumed: false,
    };
}

function cloneInventoryForProjection(state) {
    let projectedHead = null;
    let projectedTail = null;
    let projectedUquiver = null;
    for (let source = inventoryHead(state); source; source = source.nobj) {
        const projected = { ...source, nobj: null };
        if (source === state.uquiver) projectedUquiver = projected;
        if (projectedTail) projectedTail.nobj = projected;
        else projectedHead = projected;
        projectedTail = projected;
    }
    return { projectedHead, projectedUquiver };
}

function projectMerge(target, incoming) {
    if (!incoming.lamplit && !incoming.globby) {
        target.age = Math.trunc(
            (target.age * target.quan + incoming.age * incoming.quan)
            / (target.quan + incoming.quan),
        );
    }
    if (!target.globby) target.quan += incoming.quan;
    if (!oname(target) && oname(incoming)) {
        target.oextra = {
            ...(target.oextra ?? {}),
            oname: incoming.oextra.oname,
        };
    }
    if (Boolean(incoming.known) !== Boolean(target.known))
        target.known = true;
    if (Boolean(incoming.rknown) !== Boolean(target.rknown))
        target.rknown = true;
    if (Boolean(incoming.bknown) !== Boolean(target.bknown))
        target.bknown = true;
    return target;
}

function projectAddinv(obj, projectedEnv) {
    const { state } = projectedEnv;
    obj.where = OBJ_FREE;
    obj.nobj = null;
    obj.nexthere = null;
    obj.no_charge = false;
    obj.how_lost = LOST_NONE;

    const prize = specialPrize(obj, state);
    if (prize) obj.nomerge = false;

    let target = null;
    if (state.uquiver && preflightMerged(state.uquiver, obj, projectedEnv)) {
        target = state.uquiver;
    } else {
        let previous = null;
        let current = inventoryHead(state);
        while (current && !preflightMerged(current, obj, projectedEnv)) {
            previous = current;
            current = current.nobj;
        }
        if (current) {
            target = current;
        } else {
            assigninvlet(obj, state);
            const fixedLetters = state.flags?.invlet_constant ?? true;
            if (fixedLetters || !previous) {
                obj.nobj = inventoryHead(state);
                setInventoryHead(state, obj);
                if (fixedLetters) reorder_invent(state);
            } else {
                previous.nobj = obj;
            }
            obj.where = OBJ_INVENT;
            target = obj;
        }
    }

    if (target !== obj) projectMerge(target, obj);
    target.pickup_prev = true;
    if (!(state.flags?.invlet_constant ?? true)) {
        target.invlet = NOINVSYM;
        reassign(state);
    }
    return {
        projectedResult: target,
        // pickup.c lift_object() applies the 52-slot limit one object at a
        // time, after merge_choice(), and excludes gold.  Expose that exact
        // projected fact to pickup's atomic floor-transaction planner.
        addedOrdinarySlot: target === obj && obj.oclass !== COIN_CLASS,
    };
}

// Plan a source-ordered series of invent.c addinv()/prinv() calls without
// changing discovery, floor ownership, inventory, output, or pickup flags.
// Each projected item is observed just before its projected insertion, as
// pickup_object() does, so later items see both discovery-driven mergeability
// and every earlier selected object in the projected inventory.
export function preflight_addinv_sequence(objects, env = {}, options = {}) {
    const normalized = inventoryEnv(env);
    const { projectedHead, projectedUquiver } = cloneInventoryForProjection(
        normalized.state,
    );
    const projectedState = {
        ...normalized.state,
        flags: { ...(normalized.state.flags ?? {}) },
        invent: projectedHead,
        lastinvnr: normalized.state.lastinvnr,
    };
    projectedState.uquiver = projectedUquiver;
    const projectedEnv = { ...normalized, state: projectedState };
    resetJustPicked(projectedHead);

    const plans = [];
    for (const source of objects) {
        const plan = preflight_addinv(source, normalized);
        const projected = {
            ...source,
            oextra: source.oextra ? { ...source.oextra } : source.oextra,
        };
        if (options.observeObjects && !isHallucinating(projectedEnv))
            projected.dknown = true;
        const result = projectAddinv(projected, projectedEnv);
        plans.push({ ...plan, ...result });
    }
    return plans;
}

// Shared prefix of invent.c addinv_core0(), through addinv_core1().
function beginAddinv(obj, env, prepared) {
    const plan = prepared ?? preflight_addinv(obj, env);
    if (prepared && plan.object !== obj)
        throw new Error('addinv: prepared plan belongs to another object');
    if (prepared && plan.normalized.state !== (env.state ?? game))
        throw new Error('addinv: prepared plan belongs to another state');
    if (prepared && plan.consumed)
        throw new Error('addinv: prepared plan was already consumed');
    const normalized = plan.normalized;
    const { state } = normalized;
    if (obj.where !== OBJ_FREE)
        throw new Error(`addinv: object where=${obj.where}, expected OBJ_FREE`);
    if (obj.nobj || obj.nexthere)
        throw new Error('addinv: free object retains a chain link');
    plan.consumed = true;
    if (obj.how_lost === LOST_EXPLODING) return null;

    const addinvFacts = plan.addinvFacts;
    const willConsiderAutoquiver = obj.how_lost === LOST_THROWN
        && state.flags?.pickup_thrown
        && !state.uquiver;
    const carryEffects = plan.carryEffects;

    obj.no_charge = false;
    if (obj.cobj) clearContainedNoCharge(obj);
    obj.how_lost = LOST_NONE;
    if (state.loot_reset_justpicked) {
        state.loot_reset_justpicked = false;
        resetJustPicked(inventoryHead(state));
    }

    addinv_core1(obj, normalized, addinvFacts);
    return {
        addinvFacts,
        carryEffects,
        normalized,
        state,
        willConsiderAutoquiver,
    };
}

function insertInventoryObject(obj, previous, state) {
    assigninvlet(obj, state);
    const fixedLetters = state.flags?.invlet_constant ?? true;
    if (fixedLetters || !previous) {
        obj.nobj = inventoryHead(state);
        setInventoryHead(state, obj);
        if (fixedLetters) reorder_invent(state);
    } else {
        previous.nobj = obj;
        obj.nobj = null;
    }
    obj.where = OBJ_INVENT;
}

// C ref: addinv_core0()'s other_obj arm.  The source searches for the
// predecessor explicitly, so an object that is already the chain head does
// not match this arm and falls through to normal merge/insertion handling.
function insertInventoryObjectBefore(obj, otherObj, state) {
    if (!otherObj) return false;
    for (let current = inventoryHead(state); current; current = current.nobj) {
        if (current.nobj !== otherObj) continue;
        obj.nobj = otherObj;
        current.nobj = obj;
        obj.where = OBJ_INVENT;
        return true;
    }
    return false;
}

function finishAddinv(context, obj, inserted, updatePermInvent = true) {
    const {
        addinvFacts,
        carryEffects,
        normalized,
        state,
        willConsiderAutoquiver,
    } = context;
    if (inserted
        && !context.insertedBefore
        && willConsiderAutoquiver
        && shouldAutoquiver(obj, state))
        setQuiver(obj, normalized);
    obj.pickup_prev = true;
    const finish = () => {
        carry_obj_effects(obj, normalized, carryEffects);
        if (updatePermInvent) update_inventory(normalized);
        return obj;
    };
    const effects = addinv_core2(obj, normalized, addinvFacts);
    if (isThenable(effects)) return Promise.resolve(effects).then(finish);
    return finish();
}

// C ref: invent.c addinv_core0().
function addinv_core0(
    obj, env = {}, prepared = null, updatePermInvent,
    otherObj = null,
) {
    const context = beginAddinv(obj, env, prepared);
    if (!context) return null;
    const { normalized, state } = context;
    let inserted = false;
    if (insertInventoryObjectBefore(obj, otherObj, state)) {
        inserted = true;
        context.insertedBefore = true;
    } else if (state.uquiver && merged(state.uquiver, obj, normalized)) {
        obj = state.uquiver;
    } else {
        let previous = null;
        let current = inventoryHead(state);
        while (current && !merged(current, obj, normalized)) {
            previous = current;
            current = current.nobj;
        }
        if (current) {
            obj = current;
        } else {
            insertInventoryObject(obj, previous, state);
            inserted = true;
        }
    }
    return finishAddinv(context, obj, inserted, updatePermInvent);
}

// C ref: invent.c addinv().
export function addinv(obj, env = {}, prepared = null) {
    return addinv_core0(obj, env, prepared, true);
}

// C ref: invent.c addinv_before().  Throw-and-return keeps the object's
// original inventory position when !fixinv is active; the helper preserves
// the source's predecessor search and still permits normal fallback when the
// requested successor is absent.
export function addinv_before(obj, otherObj, env = {}) {
    return addinv_core0(obj, env, null, true, otherObj);
}

// Live counterpart of addinv_core0().  It leaves the synchronous API to
// generation and startup callers while allowing invent.c merged()'s pline()
// to suspend before obfree() and the addinv_core0() tail.  Every live caller
// belongs here: C prints that message before it frees the incoming object and
// before its own caller's prinv(), and only an awaited merge reproduces that
// order.
async function addinvCore0Runtime(
    obj, env = {}, prepared = null, updatePermInvent,
    otherObj = null,
) {
    // Live addinv() may be called by a wish or a container path with only a
    // state argument. Supply ttyPline to the async addinv_core2() arm while
    // leaving synchronous startup addinv() free of an unawaited Promise.
    const liveEnv = {
        ...env,
        hooks: {
            ...(env.hooks ?? {}),
            message: env.hooks?.message ?? env.message ?? ttyPline,
        },
    };
    const context = beginAddinv(obj, liveEnv, prepared);
    if (!context) return null;
    const { normalized, state } = context;
    let inserted;
    let mergedObject;

    if (insertInventoryObjectBefore(obj, otherObj, state)) {
        inserted = true;
        context.insertedBefore = true;
    } else if (state.uquiver) {
        mergedObject = mergedRuntime(state.uquiver, obj, normalized);
        if (isThenable(mergedObject))
            mergedObject = await mergedObject;
        if (mergedObject) obj = state.uquiver;
    }
    if (!mergedObject) {
        let previous = null;
        let current = inventoryHead(state);
        while (current) {
            mergedObject = mergedRuntime(current, obj, normalized);
            if (isThenable(mergedObject))
                mergedObject = await mergedObject;
            if (mergedObject) break;
            previous = current;
            current = current.nobj;
        }
        if (current) {
            obj = current;
        } else {
            insertInventoryObject(obj, previous, state);
            inserted = true;
        }
    }
    return finishAddinv(context, obj, inserted, updatePermInvent);
}

// C ref: invent.c addinv(), which is addinv_core0(obj, NULL, TRUE).
export async function addinv_runtime(obj, env = {}, prepared = null) {
    return addinvCore0Runtime(obj, env, prepared, true);
}

export function addinv_nomerge(obj, env = {}) {
    const previous = obj.nomerge;
    obj.nomerge = true;
    try {
        return addinv(obj, env);
    } finally {
        obj.nomerge = previous;
    }
}

// C ref: invent.c reassign() (4855-4884).  !fixinv inventories use the chain
// order for consecutive letters, with gold forced back to '$' at the head.
export function reassign(state = game) {
    let previous = null;
    let gold = null;
    for (let obj = inventoryHead(state); obj; obj = obj.nobj) {
        if (obj.oclass !== COIN_CLASS) {
            previous = obj;
            continue;
        }
        gold = obj;
        if (previous) previous.nobj = gold.nobj;
        else setInventoryHead(state, gold.nobj);
        break;
    }

    let index = 0;
    for (let obj = inventoryHead(state); obj; obj = obj.nobj, ++index)
        obj.invlet = index < INVLET_BASIC ? inventoryLetter(index) : NOINVSYM;
    if (gold) {
        gold.invlet = '$';
        gold.nobj = inventoryHead(state);
        setInventoryHead(state, gold);
    }
    state.lastinvnr = Math.min(index, INVLET_BASIC - 1);
    return inventoryHead(state);
}

// C ref: invent.c obj_to_let() (2857-2868).  Answers the object's inventory
// letter after applying !fixinv's source relettering pass when needed.
export function obj_to_let(obj, state = game) {
    if (!(state.flags?.invlet_constant ?? true)) {
        obj.invlet = NOINVSYM;
        reassign(state);
    }
    return obj.invlet;
}

// C ref: invent.c xprname() (2892-2953).  Formats one inventory line:
// "<letter> - <name>", with a period when `dot` is set.
//
// The price column at 2926-2936 is also used for unpaid or expended items.
export function xprname(obj, txt, invletter, dot, cost, quan, state = game) {
    const use_invlet = (state.flags?.invlet_constant ?? true) && obj != null
        && invletter !== CONTAINED_SYM && invletter !== HANDS_SYM;
    let savequan = 0;
    let letter = invletter;

    if (quan && obj) {
        savequan = obj.quan;
        obj.quan = quan;
    }
    try {
        /*
         * If let is:
         *  -  Then obj == null and 'txt' refers to hands or fingers.
         *  *  Then obj == null and we are printing a total amount.
         *  >  Then the object is contained and doesn't have an inventory
         *     letter.
         */
        const text = txt ?? donameFresh(obj, state);
        if (cost !== 0 || letter === '*') {
            // C uses a tab before the price when menu_tab_sep is enabled;
            // otherwise it reserves a 45-column name field.  `currency()`
            // intentionally remains in this function's source order, since
            // hallucination consumes the display RNG here.
            if (dot && use_invlet) letter = obj.invlet;
            const suffix = `${state.iflags?.menu_tab_sep ? '\t' : ' '}`
                + String(cost).padStart(6, ' ')
                + ` ${currency(cost, state)}`;
            const textLength = text.length;
            if (state.iflags?.menu_tab_sep) {
                const limit = BUFSZ - 1 - (4 + suffix.length);
                return `${letter} - ${text.slice(0, Math.max(0, limit))}${suffix}`;
            }
            // `%c - %-45.*s%s`: precision is the original text length and
            // the field width pads short names to 45 bytes.
            const widthText = text.slice(0, textLength).padEnd(45, ' ');
            const limit = BUFSZ - 1 - (4 + suffix.length);
            return `${letter} - ${widthText.slice(0, Math.max(0, limit))}${suffix}`;
        }
        /* ordinary inventory display or pickup message */
        if (use_invlet) letter = obj.invlet;
        const suffix = dot ? '.' : '';
        /* 4: the "c - " prefix */
        const limit = BUFSZ - 1 - (4 + suffix.length);
        return `${letter} - ${text.slice(0, limit)}${suffix}`;
    } finally {
        if (savequan) obj.quan = savequan;
    }
}

// C ref: invent.c prinv() (2869-2890).  Prints the indicated quantity of the
// given object; quan == 0 means the object's own quantity.
export async function prinv(prefix, obj, quan, env = {}) {
    const normalized = inventoryEnv(env);
    const { state } = normalized;
    const total_of = Boolean(quan && quan < obj.quan);
    const head = prefix ?? '';
    const totalbuf = total_of ? ` (${obj.quan} in total).` : '';

    // pline()'s owner, injectable the way pickup.c encumber_msg()'s is, so a
    // test can read the line without a display.
    const message = normalized.hooks.message ?? ttyPline;
    await message(
        `${head}${head ? ' ' : ''}`
        + xprname(obj, null, obj_to_let(obj, state), !total_of, 0, quan, state)
        + (state.flags?.verbose ? totalbuf : ''),
        state,
    );
}

// invent.c:1261-1264 and pickup.c:1757-1758 are the same two lines:
// `if (prev_encumbr < flags.pickup_burden) prev_encumbr = flags.pickup_burden`,
// which is max(current encumbrance, the pickup_burden option). options.c
// initoptions_init() starts flags.pickup_burden at MOD_ENCUMBER and
// optfn_pickup_burden() is what changes it; js/options.js ports both, so the
// field always holds one of hack.h's encumbrance levels.
function encumbranceLimit(current, state) {
    return Math.max(current, state.flags.pickup_burden);
}

// Predicts invent.c:1274-1276, the test C makes after addinv_core0(). C reads
// inv_cnt() and near_capacity() once the object is in inventory; this reads
// them before, so it adds the slot and the weight itself. The two agree only
// because the caller below admits no object that can merge, which is what
// makes the added slot exactly one and the added weight exactly obj.owt.
// C's `obj->otyp != LOADSTONE || !obj->cursed` clause is absent for the same
// reason: objects.h gives the one loadstone type oc_merge, so no object that
// reaches here can be one.
//
// C calls addinv_core0(obj, NULL, FALSE), whose FALSE holds back the
// permanent-inventory refresh until the explicit update_inventory() below.
function projectsDropOnHold(obj, state) {
    const hadGw = Object.hasOwn(state, 'gw');
    const previousGw = state.gw;
    const hadWeightCache = previousGw
        && Object.hasOwn(previousGw, 'wc');
    const previousWeightCache = previousGw?.wc;
    try {
        const projectedLimit = encumbranceLimit(near_capacity(state), state);
        return inv_cnt(false, state) + 1 > INVLET_BASIC
            || calc_capacity(obj.owt, state) > projectedLimit;
    } finally {
        // inv_weight() caches weight_cap() in gw.wc. The prediction precedes
        // the drop preflight, so put that cache back before a refusal can
        // escape. The source-visible calculation runs again after admission.
        if (!hadGw) {
            delete state.gw;
        } else if (!previousGw) {
            state.gw = previousGw;
        } else if (!hadWeightCache) {
            delete previousGw.wc;
        } else {
            previousGw.wc = previousWeightCache;
        }
    }
}

// Prepare the only drop_it route this port can finish: the one invent.c:1280
// jumps to, from the encumbrance test above it. makewish() calls this before
// doname() records discovery and before it increments wish conduct. The token
// records both a hold decision and an admitted drop decision so
// hold_another_object() need not repeat a guard after those source-ordered
// writes. It also restores near_capacity()'s cache before returning.
//
// The type is not what decides this. C's drop_it makes no test of one, and the
// two properties below are what the ported tail needs: a merge would reach
// splitobj() at 1279, and an artifact would have taken the place_object() and
// touch_artifact() block at 1218-1244. Which objects then arrive is a question
// for preflight_dropx(), which answers it from the square, the pile and the
// object's own timers rather than from its otyp.
export function prepareHoldDropAdmission(obj, env = {}) {
    const normalized = inventoryEnv(env);
    const { state } = normalized;
    if (!obj || typeof obj !== 'object')
        throw new TypeError('hold-drop admission requires an object');
    if (obj.oartifact || state.objects?.[obj.otyp]?.oc_merge)
        return null;
    // invent.c:1245-1250 sends a fumbling hero to drop_it by a different route,
    // setting nomerge and skipping the encumbrance test entirely. That route is
    // unported. hold_another_object() below stops on it anyway, but only after
    // the writes this token exists to precede, so the objects the token covers
    // stop here instead.
    if (propertyPresent(state, FUMBLING))
        throw new UnsupportedObjectOperationError('held while fumbling', obj);
    const willDrop = projectsDropOnHold(obj, state);
    let dropObject = null;
    let dropAdmission = null;
    if (willDrop) {
        dropObject = requiredHook(normalized, 'dropObject', obj);
        dropAdmission = requiredHook(
            normalized,
            'preflightDropObject',
            obj,
        )(obj, normalized);
    }
    return {
        consumed: false,
        dropAdmission,
        dropObject,
        inventory: state.invent ?? null,
        object: obj,
        objectFacts: {
            oartifact: obj.oartifact,
            otyp: obj.otyp,
            owt: obj.owt,
            quan: obj.quan,
            where: obj.where,
        },
        state,
        willDrop,
    };
}

function consumeHoldDropAdmission(obj, state, admission) {
    if (!admission) return null;
    if (admission.object !== obj)
        throw new Error('hold-drop admission belongs to another object');
    if (admission.state !== state)
        throw new Error('hold-drop admission belongs to another state');
    if (admission.consumed)
        throw new Error('hold-drop admission was already consumed');
    const facts = admission.objectFacts;
    if ((state.invent ?? null) !== admission.inventory
        || obj.oartifact !== facts.oartifact
        || obj.otyp !== facts.otyp
        || obj.owt !== facts.owt
        || obj.quan !== facts.quan
        || obj.where !== facts.where) {
        throw new Error('hold-drop admission is stale');
    }
    admission.consumed = true;
    return admission;
}

// C ref: invent.c hold_another_object() (1207-1306), restricted to the plain
// addinv arm and the nonmerging route through drop_it. Artifact, Fumbling,
// fatal-corpse, merging and the other drop routes remain fail-closed, and
// projectsDropOnHold() above is what predicts which of the two arms C takes.
export async function hold_another_object(
    obj, drop_fmt, drop_arg, hold_msg, env = {}, preparedHoldDrop = null,
) {
    const normalized = inventoryEnv(env);
    const { state } = normalized;

    // Direct callers retain the old entry contract. makewish() supplies the
    // prepared token so the supported hold and drop decisions are made before
    // discovery and conduct; the refusals below stay where C tests them.
    const holdDropAdmission = consumeHoldDropAdmission(
        obj,
        state,
        preparedHoldDrop
            ?? prepareHoldDropAdmission(obj, normalized),
    );

    if (!isBlind(normalized))
        observe_object(obj, state); /* maximize mergeability */
    if (obj.oartifact) {
        /* place_object may change these */
        const crysknife = obj.otyp === CRYSKNIFE;
        const oerode = obj.oerodeproof;
        const wasUpolyd = Upolyd(state.u);

        /* in case touching this object turns out to be fatal */
        place_object(obj, state.u.ux, state.u.uy, normalized);

        if (!await touch_artifact(obj, state.youmonst, normalized)) {
            // invent.c:1228-1230 pulls the artifact back off the floor and
            // drops it again through dropy().  touch_artifact() answers false
            // only for a monster, and this caller is always the hero, so the
            // branch stands unported behind a fail-closed stop.
            throw new UnsupportedObjectOperationError('refused artifact', obj);
        } else if (wasUpolyd && !Upolyd(state.u)) {
            // 1231-1238: only the blast touch_artifact() refuses can revert
            // the hero's form, so nothing can reach this yet.
            throw new UnsupportedObjectOperationError('lost artifact grip',
                                                      obj);
        }
        obj_extract_self(obj, normalized);
        if (crysknife) {
            obj.otyp = CRYSKNIFE;
            obj.oerodeproof = oerode;
        }
    }
    if (propertyPresent(state, FUMBLING)) {
        throw new UnsupportedObjectOperationError('held while fumbling', obj);
    } else if (obj.otyp === CORPSE && obj.wishedfor) {
        throw new UnsupportedObjectOperationError('held fatal corpse', obj);
    } else {
        const oquan = obj.quan;
        /* encumbrance limit is max( current_state, pickup_burden ), taken
           before addinv() */
        const prev_encumbr = encumbranceLimit(near_capacity(state), state);
        /* C copies drop_arg into a local buffer here, because addinv() could
           recycle the obuf[] doname() built it in; JavaScript strings need no
           such copy */
        obj = await addinvCore0Runtime(obj, normalized, null, false);
        if (inv_cnt(false, state) > INVLET_BASIC
            || ((obj.otyp !== LOADSTONE || !obj.cursed)
                && near_capacity(state) > prev_encumbr)) {
            /* 1275-1281 undoes any merge that took place and drops it */
            if (!holdDropAdmission?.willDrop || obj.quan !== oquan) {
                throw new UnsupportedObjectOperationError('held object dropped',
                                                          obj);
            }
            if (drop_fmt) {
                const message = normalized.hooks.message ?? ttyPline;
                await message(drop_fmt.replace('%s', drop_arg ?? ''), state);
            }
            obj.nomerge = 0;
            await holdDropAdmission.dropObject(
                obj,
                normalized,
                holdDropAdmission.dropAdmission,
            );
            return null;
        }
        if (state.flags?.autoquiver && !state.uquiver && !obj.owornmask) {
            /* 1283-1286 quivers a missile; ammo_and_launcher() is unported */
            throw new UnsupportedObjectOperationError('held autoquiver', obj);
        }
        if (hold_msg || drop_fmt)
            await prinv(hold_msg, obj, oquan, normalized);
        /* obj made it into inventory and is staying there */
        update_inventory(normalized);
        await requiredHook(normalized, 'encumberMessage', obj)(state);
    }
    return obj;
}

// C ref: mkobj.c add_to_minv(). Returns true when `obj` merged into an
// existing stack and was freed, false when it was linked into the inventory.
export function add_to_minv(monster, obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (!monster || typeof monster !== 'object')
        throw new TypeError('add_to_minv requires a monster');
    if (obj.where !== OBJ_FREE) {
        throw new Error(
            `add_to_minv: object where=${obj.where}, expected OBJ_FREE`,
        );
    }

    for (let current = monster.minvent; current; current = current.nobj) {
        if (merged(current, obj, normalized)) return true;
    }
    obj.where = OBJ_MINVENT;
    obj.ocarry = monster;
    obj.nobj = monster.minvent ?? null;
    monster.minvent = obj;
    return false;
}

export function add_to_container(container, obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (obj.where !== OBJ_FREE) {
        throw new Error(
            `add_to_container: object where=${obj.where}, expected OBJ_FREE`,
        );
    }
    if (obj.nobj || obj.nexthere) {
        throw new Error(
            'add_to_container: free object retains a chain link',
        );
    }
    if (container.where !== OBJ_INVENT && container.where !== OBJ_MINVENT) {
        requiredHook(normalized, 'objectNoLongerHeld', obj)(obj, normalized);
    }

    for (let current = container.cobj; current; current = current.nobj) {
        if (merged(current, obj, normalized)) return current;
    }
    obj.where = OBJ_CONTAINED;
    obj.ocontainer = container;
    obj.nobj = container.cobj;
    container.cobj = obj;
    return obj;
}

export function useupall(obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (obj.where !== OBJ_INVENT)
        throw new Error('useupall requires an inventory object');
    requireInventoryRefresh(normalized);
    preflightFreeinvCore(obj, normalized);
    preflightObfree(obj, null, normalized);
    if (obj.owornmask) {
        requiredHook(normalized, 'setNotWorn', obj)(obj, normalized);
        if (obj.owornmask)
            throw new Error('setNotWorn must clear owornmask');
    }
    freeinv(obj, normalized);
    obfree(obj, null, normalized);
}

// C ref: invent.c useup() (1319-1333). One item of a stack is consumed; the
// last one takes the whole object out of inventory.
export function useup(obj, env = {}) {
    const normalized = inventoryEnv(env);
    if (obj.quan > 1) {
        obj.in_use = false; /* no longer in use */
        obj.quan--;
        obj.owt = weight(obj, normalized);
        update_inventory(normalized);
    } else {
        useupall(obj, normalized);
    }
}

// C ref: invent.c consume_obj_charge() (1336-1347).  The optional billing
// check precedes the decrement, and a known charged object refreshes the
// permanent inventory immediately after the write.
export function consume_obj_charge(obj, maybe_unpaid, env = {}) {
    const normalized = inventoryEnv(env);
    if (maybe_unpaid) check_unpaid(obj, normalized.state);
    obj.spe -= 1;
    if (obj.known) update_inventory(normalized);
    return obj;
}

export function resetInventory(env = {}) {
    const normalized = inventoryEnv(env);
    requireInventoryRefresh(normalized);
    for (let obj = inventoryHead(normalized.state); obj; obj = obj.nobj) {
        preflightFreeinvCore(obj, normalized);
        preflightObfree(obj, null, normalized);
    }
    normalized.state.lastinvnr = INVLET_BASIC - 1;
    while (inventoryHead(normalized.state))
        useupall(inventoryHead(normalized.state), normalized);
    return normalized.state;
}

// C ref: invent.c currency(). Hallucination picks a random name from
// currencies[] through ROLL_FROM(), which draws from the display RNG.  Keep
// this stream separate from gameplay RNG; callers may inject it for tests.
const CURRENCIES = Object.freeze([
    'Altarian Dollar',
    'Ankh-Morpork Dollar',
    'auric',
    'buckazoid',
    'cirbozoid',
    'credit chit',
    'cubit',
    'Flanian Pobble Bead',
    'fretzer',
    'imperial credit',
    'Hong Kong Luna Dollar',
    'kongbuck',
    'nanite',
    'quatloo',
    'simoleon',
    'solari',
    'spacebuck',
    'sporebuck',
    'Triganic Pu',
    'woolong',
    'zorkmid',
]);

export function currency(amount, state = game, env = {}) {
    const displayRandom = env.displayRandom
        ?? ((range) => rn2_on_display_rng(range, state));
    const res = isHallucinating({ state })
        ? CURRENCIES[displayRandom(CURRENCIES.length)]
        : 'zorkmid';
    return amount !== 1 ? makeplural(res) : res;
}

export function money_cnt(head = inventoryHead(game)) {
    for (let obj = head; obj; obj = obj.nobj) {
        if (obj.oclass === COIN_CLASS) return obj.quan;
    }
    return 0;
}

// C ref: invent.c count_unpaid(). Nested contents remain on their own nobj
// chains, so each contained object contributes once regardless of quantity.
export function count_unpaid(list) {
    let count = 0;
    for (let obj = list; obj; obj = obj.nobj) {
        if (obj.unpaid) ++count;
        if (obj.cobj) count += count_unpaid(obj.cobj);
    }
    return count;
}

// C ref: invent.c dounpaid() (3654-3792). Build the same unpaid-object text
// window, including contained-object disclosure and floor/buried notices.
// `displayTextWindow` is injectable for focused callers while production uses
// the shared TTY text-window owner.
export async function dounpaid(
    count, floorcount, buriedcount, state = game, hooks = {},
) {
    let object = null;
    let marker = null;
    let container = null;
    const extraCount = Math.trunc(floorcount ?? 0) + Math.trunc(buriedcount ?? 0);
    if (count === 1 && extraCount === 0) {
        object = find_unpaid(inventoryHead(state), { value: null });
        container = object ? unknwn_contnr_contents(object) : null;
    }
    const formatName = (obj) => distant_name(
        obj, (value, current) => donameFresh(value, current), state,
    );
    const withSuppressedPrice = (fn) => {
        state.iflags ??= {};
        const old = state.iflags.suppress_price;
        state.iflags.suppress_price = Math.trunc(old ?? 0) + 1;
        try { return fn(); } finally { state.iflags.suppress_price = old; }
    };
    if (object && !container) {
        const cost = unpaid_cost(object, COST_NOCONTENTS, state);
        const text = withSuppressedPrice(() => xprname(
            object,
            formatName(object),
            carried(object) ? object.invlet : CONTAINED_SYM,
            true,
            cost,
            0,
            state,
        ));
        await ttyPline(text, state);
        return;
    }

    if (!state.flags.invlet_constant)
        reassign(state);
    const lines = [];
    let totalCost = 0;
    let numSoFar = 0;
    const classes = state.flags.sortpack ? state.flags.inv_order : [null];
    for (const oclass of classes) {
        let classcount = 0;
        for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj) {
            if (oclass !== null && otmp.oclass !== oclass) continue;
            if (!otmp.unpaid) continue;
            if (state.flags.sortpack && !classcount++)
                lines.push(let_to_name(oclass, true, false));
            const cost = unpaid_cost(otmp, COST_NOCONTENTS, state);
            totalCost += cost;
            const text = withSuppressedPrice(() => xprname(
                otmp, formatName(otmp), otmp.invlet, true, cost, 0, state,
            ));
            lines.push(text);
            ++numSoFar;
        }
    }
    if (count > numSoFar) {
        if (state.flags.sortpack) lines.push(let_to_name(CONTAINED_SYM, true, false));
        for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj) {
            if (!hasContents(otmp)) continue;
            let containedCost = 0;
            marker = { value: null };
            while ((object = find_unpaid(otmp.cobj, marker))) {
                const cost = unpaid_cost(object, COST_NOCONTENTS, state);
                totalCost += cost;
                containedCost += cost;
                if (otmp.cknown) {
                    lines.push(withSuppressedPrice(() => xprname(
                        object, formatName(object), CONTAINED_SYM, true,
                        cost, 0, state,
                    )));
                }
            }
            if (!otmp.cknown) {
                const containerName = s_suffix(xnameFresh(otmp, state));
                lines.push(withSuppressedPrice(() => xprname(
                    null, `${containerName} contents`, CONTAINED_SYM, true,
                    containedCost, 0, state,
                )));
            }
        }
    }
    if (count > 0) {
        lines.push('');
        lines.push(xprname(null, 'Total:', '*', false, totalCost, 0, state));
    }
    if (extraCount > 0) {
        const verb = extraCount > 1 ? 'are' : 'is';
        const where = buriedcount === 0 ? 'on the floor'
            : floorcount === 0 ? 'under the floor' : 'on or under the floor';
        if (!count) {
            const message = hooks.message ?? ttyPline;
            await message(
                `You aren't carrying any unpaid items but there ${verb} `
                + `${extraCount} ${where}.`, state,
            );
        } else {
            lines.push('');
            lines.push(`(There ${verb} ${extraCount} more unpaid object${plur(extraCount)} ${where}.)`);
        }
    }
    if (count > 0) {
        const displayTextWindow = hooks.displayTextWindow
            ?? ((rows) => displayTtyMenuTextWindow(state, rows));
        await displayTextWindow(lines, state);
    }
}

// C ref: invent.c this_type_only() (3793-3826). `state.gt.this_type` is the
// JavaScript storage for the C global getobj context used by dotypeinv().
export function this_type_only(obj, state = game) {
    const thisType = state.gt?.this_type ?? state.this_type ?? 0;
    let result = obj.oclass === thisType;
    if (thisType === 'P') {
        result = Boolean(obj.pickup_prev);
    } else if (obj.oclass === COIN_CLASS) {
        if (thisType && 'BUCX'.includes(thisType))
            result = thisType === (state.flags?.goldX ? 'X' : 'U');
    } else {
        switch (thisType) {
        case 'B': result = Boolean(obj.bknown && obj.blessed); break;
        case 'U': result = Boolean(obj.bknown && !obj.blessed && !obj.cursed); break;
        case 'C': result = Boolean(obj.bknown && obj.cursed); break;
        case 'X': result = !obj.bknown; break;
        default: break;
        }
    }
    return result;
}

// C ref: invent.c dotypeinv() (3827-4031), the #inventtype command. The
// category and object menus retain their existing pickup owners; this wrapper
// owns the source's visible class list, special BUC filters, title, and reset
// of the temporary getobj context.
export async function dotypeinv(state = game, hooks = {}) {
    const prompt = 'What type of object do you want an inventory of?';
    state.gt ??= {};
    state.gt.this_type = 0;
    state.gt.this_title = null;
    const inventory = inventoryHead(state);
    const billx = false; // shop bill display is not yet a live inventory owner.
    if (!inventory && !billx) {
        await ttyPline("You aren't carrying anything.", state);
        state.gt.this_type = 0;
        state.gt.this_title = null;
        return ECMD_OK;
    }

    const uCarried = count_unpaid(inventory);
    const uFloor = countUnpaidFloor(state);
    const uBuried = count_unpaid(state.level?.buriedobjlist ?? null);
    const anyUnpaid = uCarried + uFloor + uBuried;
    const { bcnt, ucnt, ccnt, xcnt, jcnt } = tally_BUCX(inventory, false, state);
    let traditional = true;
    let selectedType = null;
    let classes = [];
    let choices = [];

    if (state.flags?.menu_style !== MENU_TRADITIONAL
        && (state.flags?.menu_style === MENU_FULL
            || state.flags?.menu_style === MENU_PARTIAL)) {
        traditional = false;
        let qflags = UNPAID_TYPES | BILLED_TYPES | INCLUDE_VENOM;
        if (billx) qflags |= BILLED_TYPES;
        if (bcnt) qflags |= BUC_BLESSED;
        if (ucnt) qflags |= BUC_UNCURSED;
        if (ccnt) qflags |= BUC_CURSED;
        if (xcnt) qflags |= BUC_UNKNOWN;
        if (jcnt) qflags |= JUSTPICKED;
        const { query_category } = await import('./pickup.js');
        const result = await query_category(prompt, inventory, qflags, state);
        if (!result.n) return resetDotypeContext(state);
        selectedType = result.pick_list[0]?.value ?? null;
        state.gt.this_type = selectedType;
    } else {
        classes = collect_obj_classes_invent(inventory, null, state);
        if (anyUnpaid || billx || bcnt + ccnt + ucnt + xcnt || jcnt)
            classes.push(' ');
        if (anyUnpaid) classes.push('u');
        if (billx) classes.push('x');
        if (bcnt) classes.push('B');
        if (ucnt) classes.push('U');
        if (ccnt) classes.push('C');
        if (xcnt) classes.push('X');
        if (jcnt) classes.push('P');
        const classCount = classes.length;
        choices = [...classes];
        // C appends hidden valid answers after ESC for yn_function().
        choices.push('\x1b');
        for (const special of ['u', 'x', 'B', 'U', 'C', 'X', 'P'])
            if (!classes.includes(special)) choices.push(special);
        for (let i = 0; i < MAXOCLASSES; ++i) {
            const symbol = String.fromCharCode(
                DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + i],
            );
            if (!classes.includes(symbol)) choices.push(symbol);
        }
        if (classCount > 1) {
            const answer = await yn_function(
                prompt, choices.join(''), '\0', true, state,
            );
            selectedType = answer ? String.fromCharCode(answer) : '\0';
            if (selectedType === '\0') {
                return resetDotypeContext(state);
            }
        } else if (anyUnpaid) selectedType = 'u';
        else if (billx) selectedType = 'x';
        else selectedType = classes[0] ?? '\0';
    }

    if (selectedType === 'x' || (selectedType === 'X' && billx && !xcnt)) {
        if (billx) {
            note_unported('invent.c doinvbill');
        } else {
            await ttyPline(
                `No used-up objects${anyUnpaid ? ' on your shopping bill' : ''}.`,
                state,
            );
        }
        return resetDotypeContext(state);
    }
    if (selectedType === 'u'
        || (selectedType === 'U' && anyUnpaid && !ucnt)) {
        if (anyUnpaid) await dounpaid(uCarried, uFloor, uBuried, state, hooks);
        else await ttyPline('You are not carrying any unpaid objects.', state);
        return resetDotypeContext(state);
    }

    let oclass;
    if ('BUCXP'.includes(selectedType)) oclass = selectedType;
    else oclass = def_char_to_objclass(selectedType);
    let before = '';
    let after = '';
    switch (selectedType) {
    case 'B': before = 'known to be blessed '; break;
    case 'U': before = 'known to be uncursed '; break;
    case 'C': before = 'known to be cursed '; break;
    case 'X': after = ' whose blessed/uncursed/cursed status is unknown'; break;
    case 'P': after = ' that were just picked up'; break;
    default: before = 'such '; break;
    }
    if (traditional) {
        // C's visible list has all ordinary classes before the hidden suffix;
        // membership in the latter means a valid but empty category.
        const visible = classesBeforeEscape(choices);
        if (!visible.includes(selectedType)
            && !(selectedType && visible.includes(
                String.fromCharCode(DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + oclass]),
            ))) {
            await ttyPline(
                `You have no ${before}objects${after}.`, state,
            );
            return resetDotypeContext(state);
        }
        state.gt.this_type = oclass;
    }
    if ('BUCXP'.includes(selectedType)) {
        const titleText = (`Items ${before || after}`).replace(/\s+/gu, ' ').trim();
        state.gt.this_title = `${titleText}:`;
    }

    const { query_objlist } = await import('./pickup.js');
    const result = await query_objlist(
        inventory,
        (state.flags?.invlet_constant ? USE_INVLET : 0)
            | INVORDER_SORT | INCLUDE_VENOM,
        (obj) => this_type_only(obj, state),
        state,
        state.gt.this_title ?? undefined,
    );
    if (result.n > 0) {
        const object = result.pick_list[0]?.obj;
        if (object) await itemactions(object, state, hooks);
    }
    return resetDotypeContext(state);
}

function resetDotypeContext(state) {
    state.gt.this_type = 0;
    state.gt.this_title = null;
    return ECMD_OK;
}

function classesBeforeEscape(choices) {
    const index = choices.indexOf('\x1b');
    return index >= 0 ? choices.slice(0, index) : choices;
}

function countUnpaidFloor(state) {
    const seen = new Set();
    let count = 0;
    for (const column of state.level?.objects ?? []) {
        for (const head of column ?? []) {
            for (let object = head; object; object = object.nexthere) {
                if (seen.has(object)) continue;
                seen.add(object);
                if (object.unpaid) ++count;
            }
        }
    }
    return count;
}

// C ref: invent.c adjust_ok() and adjust_gold_ok() (4917-4932).
export function adjust_ok(obj) {
    return !obj || obj.oclass === COIN_CLASS ? GETOBJ_EXCLUDE : GETOBJ_SUGGEST;
}

export function adjust_gold_ok(obj) {
    return obj ? GETOBJ_SUGGEST : GETOBJ_EXCLUDE;
}

// C ref: invent.c doorganize_core() (5068-5290). The inventory list is a
// singly-linked nobj chain; extraction and reinsertion therefore update the
// state head explicitly at each source call site.
async function doorganize_core(obj, state = game, hooks = {}) {
    if (!obj) return ECMD_CANCEL;

    const isgold = obj.oclass === COIN_CLASS;
    let splitting = null;
    let bumped = null;
    for (let current = inventoryHead(state); current; current = current.nobj) {
        if (current.nobj === obj) {
            if (current.invlet === obj.invlet) splitting = current;
            break;
        }
    }

    // C starts with '$a-zA-Z#' (or a blank in place of '$' for non-gold),
    // then removes occupied slots that cannot merge with the selected stack.
    const lets = [isgold ? GOLD_SYM : ''];
    for (let code = 97; code <= 122; ++code) lets.push(String.fromCharCode(code));
    for (let code = 65; code <= 90; ++code) lets.push(String.fromCharCode(code));
    lets.push(''); // overflow slot, filled below when it is in use
    if (!state.flags?.invlet_constant) {
        const count = inv_cnt(false, state);
        const limit = count + (splitting ? 1 : 2);
        if (limit < INVLET_BASIC) lets.length = limit;
    }
    for (let current = inventoryHead(state); current; current = current.nobj) {
        if (current === obj || mergable(current, obj, { state, hooks })) continue;
        const index = inventoryIndex(current.invlet);
        if (index >= 0) lets[index + 1] = '';
        else if (current.invlet === NOINVSYM) lets[INVLET_BASIC + 1] = NOINVSYM;
    }
    const compact = lets.filter((letterValue) => letterValue !== '').join('');
    const available = [...compact, '\0'];
    if (compact.length > 5) compactify(available);
    available.pop();
    const qbuf = `${splitting ? `Split ${obj.quan}` : 'Adjust letter'} to what `
        + `[${available.join('')}]${inventoryHead(state) ? ' (? see used letters)' : ''}?`;

    let letValue;
    let everMind = false;
    for (let tryCount = 1; ; ++tryCount) {
        letValue = isgold
            ? GOLD_SYM
            : String.fromCharCode(await yn_function(qbuf, null, '\0', true, state));
        if (letValue === '?' || letValue === '*') {
            const displayed = await display_used_invlets(
                splitting ? obj.invlet : 0,
                state,
                hooks,
            );
            if (!displayed) continue;
            letValue = displayed;
            if (letValue === '\x1b') {
                if (splitting) merged(splitting, obj, { state, hooks });
                if (!everMind) await ttyPline(Never_mind, state);
                return ECMD_OK;
            }
        }
        if (quitchars.includes(letValue)
            || (splitting && letValue === obj.invlet)) {
            if (splitting) merged(splitting, obj, { state, hooks });
            if (!everMind) await ttyPline(Never_mind, state);
            return ECMD_OK;
        }
        if (letValue === GOLD_SYM && !isgold) {
            await ttyPline(`Only gold coins may be moved into the '${GOLD_SYM}' slot.`, state);
            everMind = true;
            return ECMD_OK;
        }
        if ((letter(letValue) && letValue !== '@')
            || (available.includes(letValue) && letValue !== '-')) break;
        if (tryCount === 5) {
            if (splitting) merged(splitting, obj, { state, hooks });
            if (!everMind) await ttyPline(Never_mind, state);
            return ECMD_OK;
        }
        await ttyPline('Select an inventory slot letter.', state);
    }

    const collect = letValue === obj.invlet;
    let adjType = collect ? 'Collecting:' : splitting ? 'Splitting:' : 'Moving:';
    state.invent = extract_nobj(obj, inventoryHead(state));
    for (let current = inventoryHead(state); current; ) {
        const next = current.nobj;
        const currentName = oname(current);
        const objectName = oname(obj);
        if (collect) {
            if ((!currentName || (objectName && currentName === objectName))
                && merged(current, obj, { state, hooks })) {
                obj = current;
                const afterCurrent = obj.nobj;
                state.invent = extract_nobj(obj, inventoryHead(state));
                current = afterCurrent;
                continue;
            }
        } else if (current.invlet === letValue) {
            if ((!currentName || (objectName && currentName === objectName))
                && merged(current, obj, { state, hooks })) {
                adjType = 'Merging:';
                obj = current;
                state.invent = extract_nobj(obj, inventoryHead(state));
                break;
            }
            if (!splitting) {
                adjType = 'Swapping:';
                current.invlet = obj.invlet;
            } else {
                const savedName = objectName;
                if (savedName && !obj.oartifact && obj.oextra)
                    delete obj.oextra.oname;
                if (savedName && !mergable(current, obj, { state, hooks })) {
                    obj.oextra ??= {};
                    obj.oextra.oname = savedName;
                }
                if (merged(current, obj, { state, hooks })) {
                    adjType = 'Splitting and merging:';
                    obj = current;
                    state.invent = extract_nobj(obj, inventoryHead(state));
                } else if (inv_cnt(false, state) >= INVLET_BASIC) {
                    merged(splitting, obj, { state, hooks });
                    await ttyPline('Your pack is too full.', state);
                    return ECMD_OK;
                } else {
                    bumped = current;
                    state.invent = extract_nobj(bumped, inventoryHead(state));
                }
            }
            break;
        }
        current = next;
    }
    obj.invlet = letValue;
    obj.nobj = inventoryHead(state);
    obj.where = OBJ_INVENT;
    state.invent = obj;
    reorder_invent(state);
    if (bumped) {
        assigninvlet(bumped, state);
        bumped.nobj = inventoryHead(state);
        bumped.where = OBJ_INVENT;
        state.invent = bumped;
        reorder_invent(state);
    }
    await prinv(adjType, obj, 0, { state, hooks });
    if (bumped) await prinv('Moving:', bumped, 0, { state, hooks });
    if (splitting) clear_splitobjs(state);
    update_inventory({ state, hooks });
    return ECMD_OK;
}

// C ref: invent.c doorganize() and adjust_split() (4981-5065).
export async function doorganize(state = game, hooks = {}) {
    const inventory = inventoryHead(state);
    if (!inventory || (inventory.oclass === COIN_CLASS
        && inventory.invlet === GOLD_SYM && !inventory.nobj)) {
        await ttyPline(
            `You aren't carrying anything ${inventory ? 'adjustable' : 'to adjust'}.`,
            state,
        );
        return ECMD_OK;
    }
    if (!state.flags?.invlet_constant) reassign(state);
    const filter = check_invent_gold('adjust', state) ? adjust_gold_ok : adjust_ok;
    const obj = await getobj(
        'adjust', filter, GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state,
    );
    return doorganize_core(obj, state, hooks);
}

export async function adjust_split(state = game, hooks = {}) {
    const obj = await getobj('split', adjust_ok, GETOBJ_NOFLAGS, state);
    if (!obj || obj.quan < 2 || obj.otyp === GOLD_PIECE) return ECMD_FAIL;
    let splitAmount = obj.quan === 2 ? 1 : 0;
    if (obj.quan > 2) {
        const first = await yn_function('Split off how many?', null, '\0', true, state);
        const firstDigit = String.fromCharCode(first);
        if (!digit(firstDigit)) {
            await ttyPline(Never_mind, state);
            return ECMD_CANCEL;
        }
        const count = { value: 0 };
        const result = await get_count(
            null, first, 0, count, GC_ECHOFIRST | GC_CONDHIST, state,
        );
        const answer = result.key ? String.fromCharCode(result.key) : '';
        if (!answer || answer === '\x1b' || !quitchars.includes(answer)) {
            await ttyPline(Never_mind, state);
            return ECMD_CANCEL;
        }
        splitAmount = count.value;
    }
    if (splitAmount < 1 || splitAmount >= obj.quan) {
        await ttyPline(
            `Amount to split from current stack must ${splitAmount < 1 ? 'be at least 1.' : `be less than ${obj.quan}.`}`,
            state,
        );
        return ECMD_CANCEL;
    }
    const child = splitobj(obj, splitAmount, { state, hooks });
    return doorganize_core(child, state, hooks);
}

// C ref: invent.c invdisp_nothing() (5290-5305). A display-only menu still
// owns the screen and waits for the caller's acknowledgement.
async function invdisp_nothing(hdr, txt, state = game, hooks = {}) {
    const items = [
        add_menu_heading(hdr, state),
        { text: '' },
        { text: txt },
    ];
    const menu = hooks.menu ?? ((rows, _state, how = PICK_NONE) => (
        select_menu(state, {
            items: rows,
            how,
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        })
    ));
    await menu(items, state, PICK_NONE);
    return null;
}

// C ref: invent.c worn_wield_only() (5309-5325). The active #if 1 branch is
// deliberately just the actual equipment mask; the historical #else branch
// is excluded from the reference build.
export function worn_wield_only(obj) {
    return Boolean(obj?.owornmask);
}

// C ref: invent.c display_minventory() (5341-5386). Build the monster
// inventory menu in pack order, temporarily using the monster's species for
// object naming and weapon presentation, then restore the hero species.
export async function display_minventory(
    mon, dflags, title = null, state = game, hooks = {},
) {
    const doAll = Boolean(dflags & MINV_ALL);
    const includeHero = doAll && engulfing_u(mon, state);
    const haveInv = Boolean(mon?.minvent);
    const haveAny = haveInv || includeHero;
    const pickings = dflags & MINV_PICKMASK;
    const heading = `${s_suffix(noit_Monnam(mon, state))} `
        + `${doAll ? 'possessions' : 'armament'}:`;

    if (!(doAll ? haveAny : (mon?.misc_worn_check || mon?.mw)))
        return invdisp_nothing(title || heading, '(none)', state, hooks);

    // C's swallowed-hero row is a fake object owned by query_objlist(). The
    // current callers only use this branch with PICK_NONE; retain the source
    // dependency marker while preserving all actual monster rows.
    if (includeHero) note_unported('pickup.c query_objlist swallowed hero');

    const oldData = state.youmonst?.data;
    const oldSuppressPrice = state.iflags?.suppress_price;
    if (state.youmonst) state.youmonst.data = mon.data;
    state.iflags ??= {};
    state.iflags.suppress_price = Math.trunc(oldSuppressPrice ?? 0) + 1;

    let selected = null;
    try {
        const allow = doAll ? () => true : worn_wield_only;
        const sorted = sortloot(
            mon.minvent,
            INVORDER_SORT,
            false,
            (obj) => allow(obj),
            state,
        );
        const items = [];
        const packOrder = [...(state.flags?.inv_order ?? [])];
        for (const packClass of packOrder) {
            let printedHeading = false;
            for (const entry of sorted) {
                const obj = entry.obj;
                if (obj.oclass !== packClass || !allow(obj)) continue;
                if (!printedHeading) {
                    items.push(add_menu_heading(
                        let_to_name(
                            packClass,
                            false,
                            pickings !== PICK_NONE
                                && Boolean(state.iflags.menu_head_objsym),
                        ),
                        state,
                    ));
                    printedHeading = true;
                }
                // query_objlist() computes the glyph before doname_with_price;
                // discovery and display-RNG ordering depend on that sequence.
                const glyphInfo = obj_to_glyph(obj, state);
                const label = doname_with_price(obj, state);
                items.push({
                    // query_objlist() passes zero here; the TTY menu assigns
                    // selectors for PICK_ONE/PICK_ANY and ignores them for
                    // PICK_NONE/MINV_NOLET.
                    selector: undefined,
                    label,
                    value: obj,
                    glyphInfo,
                });
            }
        }
        // Objects whose class is absent from inv_order remain reachable in C's
        // unsorted list; preserve them after the configured pack classes.
        for (const entry of sorted) {
            const obj = entry.obj;
            if (!allow(obj) || packOrder.includes(obj.oclass)) continue;
            const glyphInfo = obj_to_glyph(obj, state);
            const label = doname_with_price(obj, state);
            items.push({
                selector: undefined,
                label,
                value: obj,
                glyphInfo,
            });
        }
        const menu = hooks.menu ?? ((rows, _state, how = PICK_ONE) => (
            select_menu(state, {
                title: title || heading,
                ...menuTitleStyle(state),
                items: rows,
                how,
                cancelValue: null,
                overlay: state.iflags?.menu_overlay !== false,
            })
        ));
        selected = await menu(items, state, pickings);
    } finally {
        state.iflags.suppress_price = oldSuppressPrice;
        if (state.youmonst) {
            // set_uasmon()'s only stateful work here is restoring the basic
            // hero species; the rest of that C helper is intentionally absent.
            state.youmonst.data = state.mons?.[state.u?.umonnum] ?? oldData;
        }
    }

    if (pickings === PICK_ANY)
        return Array.isArray(selected) ? (selected[0]?.value ?? null) : null;
    return selected?.value ?? null;
}

// C ref: invent.c doprgold().
export async function doprgold(state = game) {
    const umoney = money_cnt(inventoryHead(state));
    const hmoney = hidden_gold(false, state);

    if (state.flags.verbose) {
        let buf;
        if (!umoney) {
            buf = 'Your wallet is empty';
        } else {
            buf = `Your wallet contains ${umoney} ${currency(umoney, state)}`;
        }
        if (hmoney) {
            buf += `, ${umoney ? 'and' : 'but'} you have ${hmoney} `
                + `${umoney ? 'more' : currency(hmoney, state)}`
                + ' stashed away in your pack';
        }
        await ttyPline(`${buf}.`, state);
    } else {
        const total = umoney + hmoney;
        if (total) {
            await ttyPline(
                `You are carrying a total of ${total} ${currency(total, state)}.`,
                state,
            );
        } else {
            await ttyPline('You have no money.', state);
        }
    }
    await shopper_financial_report(state);
    if (umoney && state.iflags?.menu_requested)
        await dispinv_with_action(GOLD_SYM, state, {
            useInvlet: false,
        });
    return ECMD_OK;
}

// C ref: shk.c shopper_financial_report(). Reports shop credit and debt.
async function shopper_financial_report(state) {
    const { inside_shop, shop_keeper } = await import('./shk.js');
    const thisShkp = shop_keeper(inside_shop(state.u.ux, state.u.uy, state), state);
    if (thisShkp && !thisShkp.mextra?.eshk?.credit
        && !shop_debt(thisShkp.mextra.eshk)) {
        await ttyPline('You have no credit or debt in here.', state);
        return;
    }
    if (!thisShkp) {
        for (let mtmp = state.level?.monlist ?? state.fmon;
            mtmp;
            mtmp = mtmp.nmon) {
            if ((mtmp.mhp ?? 0) < 1 || !mtmp.isshk) continue;
            const eshk = mtmp.mextra?.eshk;
            if (!eshk) continue;
            if (eshk.credit) {
                await ttyPline(
                    `You have ${eshk.credit} ${currency(eshk.credit, state)} `
                    + `credit at ${mtmp.mname || 'the shopkeeper'}'s `
                    + `${eshk.shopName || 'shop'}.`,
                    state,
                );
            }
            const debt = shop_debt(eshk);
            if (debt) {
                await ttyPline(
                    `You owe ${mtmp.mname || 'the shopkeeper'} `
                    + `${debt} ${currency(debt, state)}.`,
                    state,
                );
            }
        }
    }
}

// C ref: invent.c wearing_armor().
export function wearing_armor(state = game) {
    return Boolean(state.uarm || state.uarmc || state.uarmf || state.uarmg
        || state.uarmh || state.uarms || state.uarmu);
}

// C ref: invent.c doprwep(). The ')' / #seeweapon command.
export async function doprwep(state = game, hooks = {}) {
    if (!state.uwep) {
        const { empty_handed } = await import('./wield.js');
        await ttyPline(`You are ${empty_handed(state)}.`, state);
    } else if (!state.iflags.menu_requested) {
        await prinv(null, state.uwep, 0, { state });
        if (state.u.twoweap)
            await prinv(null, state.uswapwep, 0, { state });
    } else {
        let lets = '';
        lets += obj_to_let(state.uwep, state);
        if (state.uswapwep)
            lets += state.uswapwep.invlet;
        if (state.uquiver)
            lets += state.uquiver.invlet;
        await dispinv_with_action(lets, state, {
            ...hooks, useInuseOrdering: true,
        });
    }
    return ECMD_OK;
}

// C ref: invent.c noarmor(). Called when not wearing_armor().
async function noarmor(report_uskin, state) {
    if (!state.uskin || !report_uskin) {
        await ttyPline('You are not wearing any armor.', state);
    } else {
        const { simpleonames } = await import('./objnam.js');
        let uskinname = simpleonames(state.uskin, state);
        if (uskinname.startsWith('set of '))
            uskinname = uskinname.slice(7);
        const dragonIdx = uskinname.indexOf(' dragon ');
        if (dragonIdx >= 0)
            uskinname = uskinname.slice(0, dragonIdx) + uskinname.slice(dragonIdx + 8);
        await ttyPline(
            `You are not wearing armor but have ${uskinname} embedded in your skin.`,
            state,
        );
    }
}

// C ref: invent.c doprarm(). The '[' / #seearmor command.
export async function doprarm(state = game, hooks = {}) {
    if (!wearing_armor(state)) {
        await noarmor(true, state);
    } else {
        let lets = '';
        if (state.uarm)
            lets += obj_to_let(state.uarm, state);
        if (state.uarmc)
            lets += obj_to_let(state.uarmc, state);
        if (state.uarms)
            lets += obj_to_let(state.uarms, state);
        if (state.uarmh)
            lets += obj_to_let(state.uarmh, state);
        if (state.uarmg)
            lets += obj_to_let(state.uarmg, state);
        if (state.uarmf)
            lets += obj_to_let(state.uarmf, state);
        if (state.uarmu)
            lets += obj_to_let(state.uarmu, state);
        await dispinv_with_action(lets, state, {
            ...hooks, useInuseOrdering: true,
        });
    }
    return ECMD_OK;
}

// C ref: invent.c doprring(). The '=' / #seerings command.
export async function doprring(state = game, hooks = {}) {
    if (!state.uleft && !state.uright) {
        await ttyPline('You are not wearing any rings.', state);
    } else {
        let lets = '';
        if (state.uright)
            lets += obj_to_let(state.uright, state);
        if (state.uleft)
            lets += obj_to_let(state.uleft, state);
        const useInuseOrdering = Boolean((state.uright
                && state.uright.oclass !== RING_CLASS)
            || (state.uleft && state.uleft.oclass !== RING_CLASS)
            || lets.length > 1 || state.iflags.menu_requested);
        await dispinv_with_action(lets, state, {
            ...hooks,
            useInuseOrdering,
            altLabel: lets.length === 1 ? 'Ring' : 'Rings',
        });
    }
    return ECMD_OK;
}

// C ref: invent.c dopramulet(). The '"' / #seeamulet command.
export async function dopramulet(state = game, hooks = {}) {
    if (!state.uamul) {
        await ttyPline('You are not wearing an amulet.', state);
    } else {
        let lets = '';
        lets += obj_to_let(state.uamul, state);
        await dispinv_with_action(lets, state, {
            ...hooks, useInuseOrdering: true, altLabel: 'Amulet',
        });
    }
    return ECMD_OK;
}

// C ref: invent.c doprtool() (4715-4734). Show every carried tool which is
// currently used, retaining list order and the 52-letter safety bound.
export async function doprtool(state = game, hooks = {}) {
    let lets = '';
    for (let obj = inventoryHead(state); obj; obj = obj.nobj) {
        if (!tool_being_used(obj, state)) continue;
        // C breaks before writing when the fixed-size lets[] buffer is full.
        if (lets.length >= INVLET_BASIC) break;
        lets += obj_to_let(obj, state);
    }
    if (!lets.length)
        await ttyPline('You are not using any tools.', state);
    else
        await dispinv_with_action(lets, state, {
            ...hooks, useInuseOrdering: true,
        });
    return ECMD_OK;
}

// C ref: invent.c doprinuse() (4740-4757). is_inuse() performs the same
// source predicate used by the in-use sort, while the display itself decides
// which rows to show after the first match is found.
export async function doprinuse(state = game, hooks = {}) {
    let inUse = false;
    for (let obj = inventoryHead(state); obj; obj = obj.nobj) {
        if (is_inuse(obj, state)) {
            inUse = true;
            break;
        }
    }
    if (!inUse)
        await ttyPline('You are not wearing or wielding anything.', state);
    else
        await dispinv_with_action(null, state, {
            ...hooks, useInuseOrdering: true,
        });
    return ECMD_OK;
}
