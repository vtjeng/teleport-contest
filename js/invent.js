// Hero inventory and nobj-chain primitives.
// C refs: src/invent.c addinv(), mergable(), merged(), nxtobj(), useupall();
//         src/mkobj.c extract_nobj(), add_to_container(), and add_to_buried().

import { calc_capacity, inv_cnt, near_capacity } from './hack.js';
import {
    ACH_MINE_PRIZE,
    ACH_SOKO_PRIZE,
    BLINDED,
    BUFSZ,
    CMDQ_KEY,
    CONTAINED_SYM,
    CQ_CANNED,
    ECMD_OK,
    FUMBLING,
    GOLD_SYM,
    HALLUC,
    HALLUC_RES,
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
    CORR,
    IRONBARS,
    IS_ALTAR,
    IS_DOOR,
    IS_FOUNTAIN,
    IS_GRAVE,
    IS_SINK,
    IS_THRONE,
    ROOM,
    TREE,
    P_BOW,
    P_CROSSBOW,
    P_DAGGER,
    P_KNIFE,
    P_SPEAR,
    SORTLOOT_INVLET,
    SORTLOOT_LOOT,
    SORTLOOT_PACK,
    is_pit,
    Is_airlevel,
    Is_waterlevel,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    LOOKHERE_SKIP_DFEATURE,
    GETOBJ_ALLOWCNT,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_EXCLUDE_NONINVENT,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    HANDS_SYM,
    Never_mind,
    quitchars,
    silly_thing_to,
    STONE_RES,
    PLNMSG_ONE_ITEM_HERE,
    PICK_NONE,
    PICK_ONE,
    P_SABER,
    P_SHORT_SWORD,
    Upolyd,
    u_at,
    W_ART,
    W_QUIVER,
} from './const.js';
import {
    ART_MJOLLNIR, confers_luck, set_artifact_intrinsic, touch_artifact,
} from './artifacts.js';
import { obj_resists } from './bury.js';
import { cmdq_clear, cmdq_pop, yn_function } from './cmd.js';
import { food_disappears } from './eat.js';
import { makeplural } from './fruit.js';
import { digit } from './hacklib.js';
import { PM_ARCHEOLOGIST, PM_CLERIC } from './monsters.js';
import { observe_object } from './o_init.js';
import { ttyPline, tty_message_menu } from './tty_message.js';
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
import { hides_under, touch_petrifies } from './mondata.js';
import { UnsupportedHideError, maybe_unhide_at } from './mon.js';
import { newsym, obj_to_glyph } from './display.js';
import { visible_region_at } from './region.js';
import { stairs_description, stairway_at } from './stairs.js';
import { is_drawbridge_wall } from './startup_a11y.js';
import { is_ice } from './terrain.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { hidden_gold } from './vault.js';
import { game } from './gstate.js';
import { itemactions } from './iactions.js';
import { surface } from './dungeon.js';
import { can_reach_floor, engr_at } from './engrave.js';
import { displayTtyMenuTextWindow, menuTitleStyle } from './tty_menu.js';
import { select_menu } from './windows.js';
import {
    AMULET_OF_YENDOR,
    AKLYS,
    ARMOR_CLASS,
    BAG_OF_TRICKS,
    BELL_OF_OPENING,
    BOULDER,
    CANDELABRUM_OF_INVOCATION,
    COIN_CLASS,
    CORPSE,
    CRYSKNIFE,
    EGG,
    FIGURINE,
    FOOD_CLASS,
    GEM_CLASS,
    GEMSTONE,
    GLASS,
    HORN_OF_PLENTY,
    LEASH,
    LOADSTONE,
    LUCKSTONE,
    PIERCE,
    POT_OIL,
    ROCK,
    SCR_BLANK_PAPER,
    SCR_MAIL,
    SCROLL_CLASS,
    SLIME_MOLD,
    SPE_BOOK_OF_THE_DEAD,
    SPBOOK_CLASS,
    TIN,
    TOOL_CLASS,
    VENOM_CLASS,
    WAR_HAMMER,
    WEAPON_CLASS,
} from './objects.js';
import {
    UnsupportedObjectOperationError,
    curseFreeObject,
    dealloc_obj,
    erosionMatters,
    greatest_erosion,
    hasContents,
    isCandle,
    isContainer,
    isPudding,
    is_ammo,
    is_missile,
    is_spear,
    objectType,
    place_object,
    preflightWeight,
    splitobj,
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
    not_fully_identified,
    vtense,
    xnameFresh,
} from './objnam.js';
import { ILLOBJ_CLASS, MAXOCLASSES } from './objects.js';
import { is_quest_artifact } from './questpgr.js';
import { UnsupportedShopError, costly_spot } from './shk.js';
import { is_pole } from './worn.js';

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
// yet. dfeature_at() is otherwise a complete translation, so every stop below
// names the C helper that is missing rather than the caller that hit it.
export class UnsupportedFeatureDescriptionError extends Error {
    constructor(helper) {
        super(`feature description requires ${helper}`);
        this.name = 'UnsupportedFeatureDescriptionError';
        this.helper = helper;
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
        if (is_drawbridge_wall(x, y, state)) {
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
        // C calls ice_descr(), which distinguishes solid from thin ice.
        throw new UnsupportedFeatureDescriptionError('ice_descr()');
    } else if (is_pool(x, y, state)) {
        dfeature = 'pool of water';
    } else if (IS_SINK(ltyp)) {
        cmap = S_sink;
    } else if (IS_ALTAR(ltyp)) {
        // C composes "altar to <deity> (<alignment>)" from a_gname() and
        // align_str(), neither of which is ported.
        throw new UnsupportedFeatureDescriptionError('a_gname()');
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

// C ref: invent.c let_to_name(). Covers the object-class headings the
// inventory menu asks for. The CONTAINED_SYM heading and the unpaid prefix
// belong to callers the port does not reach.
export function let_to_name(letter, unpaid, showsym) {
    // C's parameter is named `let`, which JavaScript reserves.
    if (unpaid) throw new UnsupportedFeatureDescriptionError('unpaid headings');
    const oclass = (letter >= 1 && letter < MAXOCLASSES) ? letter : 0;
    const class_name = CLASS_NAMES[oclass] ?? CLASS_NAMES[ILLOBJ_CLASS];
    if (!oclass || !showsym) return class_name;
    // The loop pads short names through byte column seven, then ocsymfmt
    // contributes two more spaces and the quoted compiled-in class symbol.
    const padded = class_name.padEnd(7, ' ');
    const symbol = String.fromCharCode(
        DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + oclass],
    );
    return `${padded}  ('${symbol}')`;
}

// Thrown where invent.c getobj() reaches an arm this port has not
// implemented. Every stop names the C function or option that is missing.
export class UnsupportedObjectPromptError extends Error {
    constructor(reason) {
        super(`the object prompt requires ${reason}`);
        this.name = 'UnsupportedObjectPromptError';
        this.reason = reason;
    }
}

// C ref: invent.c hands_obj. getobj() returns this shared sentinel when the
// player deliberately selects hands/self; null remains the cancellation and
// invalid-answer result. Callers compare its identity and must not inspect it
// as an ordinary object.
export const hands_obj = Object.freeze({});

// C ref: invent.c invletter_value() (390-399). Orders '$' first, then 'a'-'z',
// then 'A'-'Z', then the '#' overflow letter. `invlet_basic` is INVLET_BASIC.
function invletter_value(c) {
    if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
    if (c >= 'A' && c <= 'Z')
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 2 + 26;
    if (c === '$') return 1;
    if (c === NOINVSYM) return 1 + INVLET_BASIC + 1;
    return 1 + INVLET_BASIC + 1 + 1; /* none of the above (shouldn't happen) */
}

// C ref: invent.c sortloot() (592-643) called with SORTLOOT_INVLET alone, no
// filter and by_nexthere FALSE, which is what getobj() asks for. With neither
// SORTLOOT_PACK nor SORTLOOT_LOOT set, sortloot_cmp() (403-547) skips its
// class, subclass, discovery and name arms and reduces to invletter_value()
// with a tiebreak on the original position; Array.prototype.sort() is required
// to be stable, which is the same tiebreak.
//
// The other modes stay with their own callers. js/invent.js display_pickinv()
// already documents why SORTLOOT_INVLET|SORTLOOT_PACK needs no sort at all.
function sortlootByInvlet(state) {
    const items = [];
    for (let otmp = inventoryHead(state); otmp; otmp = otmp.nobj)
        items.push(otmp);
    return items.sort(
        (a, b) => invletter_value(a.invlet) - invletter_value(b.invlet),
    );
}

// C ref: invent.c loot_classify() (149-305). Assigns orderclass, subclass,
// disco, and inuse fields to a sortloot item based on the object's class,
// type, and discovery status.
//
// The armcat table maps C's ARM_* subtype values to a display ordering
// different from the numerical order in objclass.h.
const ARMCAT = [
    /* ARM_SUIT=0 */ 7,
    /* ARM_SHIELD=1 */ 4,
    /* ARM_HELM=2 */ 1,
    /* ARM_GLOVES=3 */ 2,
    /* ARM_BOOTS=4 */ 3,
    /* ARM_CLOAK=5 */ 5,
    /* ARM_SHIRT=6 */ 6,
    /* sentinel  */ 8,
];

// C ref: invent.c def_srt_order[] (155-158). Used when sortpack is off.
const DEF_SRT_ORDER = '\x0B\x04\x05\x06\x08\x09\x0A\x0C\x07\x0D\x02\x03\x0F\x10\x11';

function loot_classify(obj, state) {
    const otyp = obj.otyp;
    const oclass = obj.oclass;
    const type = objectType(obj, state);
    const seen = obj.dknown ? true : false;
    const discovered = type.oc_name_known ? true : false;
    if (!heroIsBlind(state))
        observe_object(obj, state);

    // Class order.
    const classorder = state.flags?.sortpack
        ? (state.flags.inv_order ?? DEF_SRT_ORDER)
        : DEF_SRT_ORDER;
    let p = -1;
    for (let i = 0; i < classorder.length; i++) {
        if ((typeof classorder[i] === 'string'
            ? classorder[i].charCodeAt(0) : classorder[i]) === oclass) {
            p = i;
            break;
        }
    }
    const orderclass = p >= 0
        ? (1 + p)
        : (1 + classorder.length + (oclass !== VENOM_CLASS ? 1 : 0));

    // Subclass designation.
    let subclass;
    switch (oclass) {
    case ARMOR_CLASS: {
        let k = type.oc_armcat ?? type.oc_subtyp ?? 0;
        if (k < 0 || k >= 7) k = 7;
        subclass = ARMCAT[k];
        break;
    }
    case WEAPON_CLASS: {
        const sk = type.oc_skill ?? type.oc_subtyp ?? 0;
        if (sk < 0) {
            subclass = (sk >= -P_CROSSBOW && sk <= -P_BOW) ? 1 : 3;
        } else {
            subclass = (sk >= P_BOW && sk <= P_CROSSBOW) ? 2
                : (sk === P_SPEAR || sk === P_DAGGER || sk === P_KNIFE) ? 4
                    : (!is_pole(obj, state)) ? 5 : 6;
        }
        break;
    }
    case TOOL_CLASS:
        if (seen && discovered
            && (otyp === BAG_OF_TRICKS || otyp === HORN_OF_PLENTY))
            subclass = 2;
        else if (isContainer(obj))
            subclass = 1;
        else
            subclass = 4;
        break;
    case FOOD_CLASS:
        switch (otyp) {
        case SLIME_MOLD: subclass = 1; break;
        case TIN: subclass = 3; break;
        case EGG: subclass = 4; break;
        case CORPSE: subclass = 5; break;
        default: subclass = obj.globby ? 6 : 2; break;
        }
        break;
    case GEM_CLASS: {
        const mat = type.oc_material ?? 0;
        if (mat === GEMSTONE)
            subclass = !seen ? 1 : !discovered ? 2 : 3;
        else if (mat === GLASS)
            subclass = !seen ? 1 : !discovered ? 2 : 4;
        else // MINERAL
            subclass = !seen ? 5
                : (otyp !== ROCK) ? (!discovered ? 6 : 7) : 8;
        break;
    }
    default:
        subclass = 1;
        break;
    }

    // Discovery status.
    const OBJ_DESCR = type.oc_descr_idx !== undefined
        ? type.oc_descr_idx : null;
    const disco = !seen ? 1
        : (discovered || OBJ_DESCR == null) ? 4
            : type.oc_uname ? 3
                : 2;

    return { orderclass, subclass, disco };
}

// C ref: invent.c loot_xname() (309-387). Formats an object name for
// alphabetical sorting, suppressing attributes (BUC, dilution, user name)
// that sortloot_cmp handles separately.
function loot_xname(obj, state) {
    // cxname with quan forced to 1, suppressing user attributes that change
    // alphabetical order. For container contents display, the exact sort
    // is less critical than for pickup menus -- cxname(obj) with quan forced
    // to 1 suffices for correct class+subclass+name ordering.
    const saved_quan = obj.quan;
    obj.quan = 1;
    let res;
    try {
        res = cxname(obj, state);
    } finally {
        obj.quan = saved_quan;
    }
    return res;
}

// C ref: invent.c sortloot_cmp() (403-547). Comparison function for sortloot
// in SORTLOOT_LOOT|SORTLOOT_PACK mode. Uses class/subclass/discovery ordering
// from loot_classify, then alphabetical name comparison, then BUC, greasing,
// erosion, erodeproofing, enchantment, and finally stable-sort tiebreak.
function sortloot_cmp(a, b, mode, state) {
    // Class/subclass/discovery ordering when PACK or LOOT is set and INVLET
    // is not set alone.
    if ((mode & (SORTLOOT_PACK | SORTLOOT_INVLET)) !== SORTLOOT_INVLET) {
        if (!a.classified) a.classified = loot_classify(a.obj, state);
        if (!b.classified) b.classified = loot_classify(b.obj, state);
        if (a.classified.orderclass !== b.classified.orderclass)
            return a.classified.orderclass - b.classified.orderclass;
        if (!(mode & SORTLOOT_INVLET)) {
            if (a.classified.subclass !== b.classified.subclass)
                return a.classified.subclass - b.classified.subclass;
            if (a.classified.disco !== b.classified.disco)
                return a.classified.disco - b.classified.disco;
        }
    }
    // Invlet ordering.
    if (mode & SORTLOOT_INVLET) {
        const v1 = invletter_value(a.obj.invlet);
        const v2 = invletter_value(b.obj.invlet);
        if (v1 !== v2) return v1 - v2;
    }
    if (!(mode & SORTLOOT_LOOT)) return a.indx - b.indx;

    // Alphabetical name comparison.
    if (!a.str) a.str = loot_xname(a.obj, state);
    if (!b.str) b.str = loot_xname(b.obj, state);
    const namcmp = a.str.toLowerCase().localeCompare(b.str.toLowerCase());
    if (namcmp !== 0) return namcmp;

    // BUC: blessed > uncursed > cursed > unknown.
    const bval = (o) => o.bknown ? (o.blessed ? 3 : !o.cursed ? 2 : 1) : 0;
    const bv1 = bval(a.obj), bv2 = bval(b.obj);
    if (bv1 !== bv2) return bv2 - bv1;

    // Greasing.
    if ((a.obj.greased ?? 0) !== (b.obj.greased ?? 0))
        return (b.obj.greased ?? 0) - (a.obj.greased ?? 0);

    // Erosion.
    const e1 = greatest_erosion(a.obj), e2 = greatest_erosion(b.obj);
    if (e1 !== e2) return e1 - e2;

    // Erodeproofing.
    const ep1 = (a.obj.rknown && a.obj.oerodeproof) ? 1 : 0;
    const ep2 = (b.obj.rknown && b.obj.oerodeproof) ? 1 : 0;
    if (ep1 !== ep2) return ep2 - ep1;

    // Enchantment.
    const type1 = objectType(a.obj, state);
    if (type1.oc_uses_known && a.obj.oclass !== FOOD_CLASS) {
        const s1 = a.obj.known ? (a.obj.spe ?? 0) : -1000;
        const s2 = b.obj.known ? (b.obj.spe ?? 0) : -1000;
        if (s1 !== s2) return s2 - s1;
    }

    return a.indx - b.indx;
}

// C ref: invent.c sortloot() (592-643). Returns an array of {obj} entries
// sorted according to mode flags. Does not reorder the linked list.
export function sortloot(olist, mode, by_nexthere, filterfunc, state = game) {
    const items = [];
    let i = 0;
    for (let o = olist; o; o = by_nexthere ? o.nexthere : o.nobj) {
        if (filterfunc && !filterfunc(o)) continue;
        items.push({ obj: o, indx: i, classified: null, str: null });
        i++;
    }
    if (mode && items.length > 1) {
        items.sort((a, b) => sortloot_cmp(a, b, mode, state));
    }
    return items;
}

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

// C ref: invent.c getobj() (1751-2088). Answers the object the player chose,
// null where C returns 0, and hands_obj where C returns &hands_obj.
//
// Every `obj_ok` answer below is awaited. do_wear.c equip_ok() reaches
// canwearobj(), whose refusals write messages, so equip_ok() is async and both
// callbacks over it -- wear_ok() and takeoff_ok() -- return promises.
// any_obj_ok() above, apply_ok() and eat_ok() are still plain functions, so the
// await is what lets one set of call sites serve both kinds.
//
// Four of C's inputs cannot arrive. gi.in_doagain is always false, because
// #repeat and its ^A binding are unported and do_repeat() is the only writer
// of that flag; cmdq_add_key(CQ_REPEAT) has no CQ_REPEAT queue to add to for
// the same reason; flags.invlet_constant is checked below because reassign()
// is unported; and iflags.force_invmenu stops rather than take an untested
// arm. The '?' menu, non-throw '*' menus and the '-' hands answer stop too,
// each naming what it would need. The ordinary throw '*' menu is source-live
// below.
//
// The fifth, C's cmdq_pop() at 1779, now has a queue to read. Itemactions
// queues a command followed by the selected object's inventory letter, so
// the CMDQ_KEY lookup arm is live. Count and user-input nodes still have no
// ported producer; an unexpected node retains the fail-closed boundary.
//
// GETOBJ_PROMPT does not stop: its only effect is the `forceprompt` term that
// steers the "You don't have anything to <foo>." return below. GETOBJ_ALLOWCNT
// does not stop on arrival either. C reads it at four points -- invent.c:1807
// for a queued count, :1940 for a typed digit, :1981 and :1996 for a menu
// selection's count -- and the first, third and fourth sit behind arms that
// already stop, so the digit at :1940 is where this port's refusal sits.
export async function getobj(word, obj_ok, ctrlflags, state = game) {
    const queued = cmdq_pop(state);
    if (queued) {
        if (queued.typ === CMDQ_KEY) {
            if (queued.key === HANDS_SYM) {
                const suitability = await obj_ok(null, state);
                if (suitability === GETOBJ_SUGGEST
                    || suitability === GETOBJ_DOWNPLAY) {
                    return hands_obj;
                }
            } else {
                for (let item = inventoryHead(state); item; item = item.nobj) {
                    if (item.invlet !== queued.key) continue;
                    const suitability = await obj_ok(item, state);
                    if (suitability === GETOBJ_SUGGEST
                        || suitability === GETOBJ_DOWNPLAY) {
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
        throw new UnsupportedObjectPromptError(
            'the object prompt has an unsupported queued answer',
        );
    }
    let otmp = null;
    let ilet = '';
    // C's bp starts at buf and the hands/self arm may advance it past a "- "
    // prefix; the letters it then collects are what `lets` copies and
    // compactify() rewrites, so the two halves are kept apart here.
    const prefix = [];
    const letters = [];
    const altlets = [];
    const allowcnt = (ctrlflags & GETOBJ_ALLOWCNT) !== 0;
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
        throw new UnsupportedObjectPromptError('reassign()');

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
    // and `altletsStr` below is the downplayed set. The bounded nonempty `?`
    // arm below hands a nonempty `lets` set to display_pickinv() for the
    // source-live read and throw callers; empty/alternate subset arms remain
    // fail-closed until their own slices are reached.
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
        let qbuf = `What do you want to ${word}?`;
        if (state.iflags.force_invmenu)
            throw new UnsupportedObjectPromptError('iflags.force_invmenu');
        qbuf += buf ? ` [${buf} or ?*]` : ' [*]';
        ilet = String.fromCharCode(
            await yn_function(qbuf, null, '\0', false, state),
        );

        if (digit(ilet)) {
            if (!allowcnt) {
                await ttyPline('No count allowed with this command.', state);
                continue;
            }
            // invent.c:1944 answers a digit with get_count(), which reads the
            // rest of the number off the terminal and echoes it, and whose
            // count then reaches splitobj() at :2082. Neither is ported, so a
            // digit typed at a prompt that allows a count stops here -- after
            // the prompt has drawn and the digit has been read, which is where
            // C first consults `allowcnt` too.
            throw new UnsupportedObjectPromptError('get_count() and splitobj()');
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
            throw new UnsupportedObjectPromptError('mime_action()');
        }
        if (ilet === '?') {
            // C ref: invent.c getobj() redo_menu (1966-1970). The ordinary
            // read and throw callbacks can produce a nonempty suggested set,
            // so display_pickinv() is source-live for those two callers.
            // Empty lets and the alternate '*' menu remain outside this
            // boundary.
            if (word !== 'read' && word !== 'throw')
                throw new UnsupportedObjectPromptError(
                    'display_pickinv() with a letter subset',
                );
            if (!lets)
                throw new UnsupportedObjectPromptError(
                    'display_pickinv() with an empty letter subset',
                );
            const picked = await display_pickinv(
                lets, null, null, false, true, state,
            );
            if (!picked) continue;
            ilet = picked;
        } else if (ilet === '*') {
            // C ref: invent.c getobj() redo_menu (1966-1998). The ordinary
            // throw callback excludes hands, so this is the full inventory
            // menu with no extra choice, query, or alternate subset. Other
            // object prompts still stop here until their menu branches are
            // selected and validated independently.
            if (word !== 'throw')
                throw new UnsupportedObjectPromptError(
                    'display_pickinv() with a letter subset',
                );
            const picked = await display_pickinv(
                null, null, null, false, true, state,
            );
            if (!picked) continue;
            if (picked === HANDS_SYM)
                return hands_obj;
            if (picked === '\x1b') {
                if (state.flags.verbose) await ttyPline(Never_mind, state);
                return null;
            }
            ilet = picked;
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
            /* the LRS arm below reads cntgiven, which stays FALSE: C's three
               writers of it are the queued count at :1809, get_count() at
               :1947 and the menu count at :1998, and all three sit behind an
               arm that stops. */
        }
        /* the "can only throw one at a time" arm reads cntgiven too. */
        state.disp.botl = true; /* May have changed the amount of money */
        /* cmdq_add_int()/cmdq_add_key(CQ_REPEAT): no CQ_REPEAT queue */
        /* verify the chosen object */
        if (!otmp) {
            await ttyPline("You don't have that object.", state);
            continue;
        }
        /* C's `cnt < 0L || otmp->quan < cnt` needs a count as well. */
        break;
    }
    if ((await obj_ok(otmp, state)) === GETOBJ_EXCLUDE) {
        // Only a letter the prompt did not suggest arrives here, because the
        // suggested set holds no excluded object: eat_ok() excludes only
        // COIN_CLASS and the gold arm above returns first, any_obj_ok()
        // excludes nothing that is carried, and apply_ok(), takeoff_ok() and
        // wear_ok() exclude what the player can still type by hand.
        await silly_thing(word, state);
        return null;
    }
    /* split_otmp: cntgiven is never set, for the reason the LRS arm gives. */
    return otmp;
}

// C ref: invent.c silly_thing() (2093-2131). Its OBSOLETE_HANDLING block at
// 2097-2122 is compiled out -- nothing in the tree defines that macro -- so
// the live body is a two-arm choice, and C's `word` is the verb the prompt
// asked with.
//
// The arm this leaves out is the Amulet of Yendor's, which needs word ==
// "call". do_name.c docallcmd() is its one C caller and is unported, so no
// ported caller can supply that word; C's `otmp` parameter exists only for
// that arm and is left out with it. The other C caller of the same format
// string is read.c:559.
async function silly_thing(word, state) {
    await ttyPline(silly_thing_to.replace('%s', word), state);
}

// compactify() and invletter_value() are staticfn in invent.c and have no
// caller outside getobj() and sortloot(). They are exported here for the tests
// that pin their results to values read from the C source: the prompt reaches
// compactify() with only the letter runs a starting pack can produce, and
// reaches invletter_value() only through a pack that is already in invlet
// order, so neither is covered for its whole input range by a recorded case.
export const _getobjInternals = Object.freeze({
    compactify,
    invletter_value,
});

// C ref: invent.c display_pickinv(). Covers the full-inventory branches (`i`
// and the ordinary throw `*` reach it), the bounded one-item suggested subset
// from getobj() (`?`), and the partial-inventory branch (equipment display
// commands pass a `lets` filter). Extra-choice, non-reply, and non-default
// sort branches remain unported.
export async function display_pickinv(
    lets,
    xtra_choice,
    query,
    allowxtra,
    want_reply,
    state = game,
    { menu } = {},
) {
    if (xtra_choice || allowxtra)
        throw new UnsupportedFeatureDescriptionError('a partial inventory');
    if (!lets && (state.iflags.force_invmenu || state.iflags.menu_requested))
        throw new UnsupportedFeatureDescriptionError('a forced inventory menu');
    if (state.flags.sortloot === 'i' || state.flags.sortloot === 'f')
        throw new UnsupportedFeatureDescriptionError('a reordered inventory');
    if (!state.flags.invlet_constant)
        throw new UnsupportedFeatureDescriptionError('reassign()');
    if (!state.flags.sortpack)
        throw new UnsupportedFeatureDescriptionError('an unpacked inventory');
    if (!state.invent)
        throw new UnsupportedFeatureDescriptionError('an empty inventory');

    // C ref: invent.c display_pickinv() n-count.  With a lets filter, n is
    // the number of matching letters; without, n is 0/1/2+ of the full pack.
    let n;
    if (lets) {
        n = lets.length;
    } else {
        n = !state.invent ? 0 : !state.invent.nobj ? 1 : 2;
        // Without lets and without wizid, C increments n to skip the
        // single-item message-line shortcut.
        if (n === 1) n++;
    }

    // C ref: invent.c display_pickinv() single-item message-line path.
    // When only one item matches and no menu is forced, show it with
    // xprname on the message line. C returns the invlet when want_reply
    // is true; otherwise 0, which the caller reads as "no selection."
    if (n === 1 && !state.iflags.force_invmenu && !state.iflags.menu_requested) {
        let match = null;
        for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
            if (!lets || lets.includes(otmp.invlet)) { match = otmp; break; }
        }
        if (match) {
            const mesg = xprname(
                match,
                null,
                lets ? lets[0] : match.invlet,
                true,
                0,
                0,
                state,
            );
            const response = await tty_message_menu(
                match.invlet.charCodeAt(0),
                want_reply ? PICK_ONE : PICK_NONE,
                mesg,
                state,
            );
            return want_reply && response ? String.fromCharCode(response) : null;
        }
        return null;
    }

    // The multi-item menu path requires both a menu owner and want_reply.
    if (!want_reply)
        throw new UnsupportedFeatureDescriptionError('a partial inventory');
    const menuOwner = menu ?? ((items) => select_menu(state, {
        items: items.map((item) => (item.heading
            ? {
                ...item,
                attr: menuTitleStyle(state).titleAttr,
                color: menuTitleStyle(state).titleColor,
            }
            : item)),
        how: PICK_ONE,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    }));

    // Formatting a name marks its type discovered, so every object is checked
    // for an unported naming branch before any of them is formatted. Without
    // this, a pack whose fifth item cannot be named would leave the first
    // four discovered and still refuse the command.
    for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
        if (lets && !lets.includes(otmp.invlet)) continue;
        assertObjectNameable(otmp, state);
    }

    // sortloot() with SORTLOOT_INVLET|SORTLOOT_PACK keeps invent order, and
    // the class walk below is what groups it, exactly as C's nextclass loop
    // does over flags.inv_order.
    const items = [];
    for (const oclass of state.flags.inv_order) {
        let classcount = 0;
        for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
            if (otmp.oclass !== oclass) continue;
            if (lets && !lets.includes(otmp.invlet)) continue;
            if (!classcount) {
                items.push({
                    text: let_to_name(
                        oclass,
                        false,
                        want_reply && state.iflags.menu_head_objsym,
                    ),
                    heading: true,
                });
                classcount++;
            }
            // display_pickinv() computes the glyph before doname().  That
            // order is observable under hallucination because both can draw
            // from the display RNG.
            const glyphInfo = obj_to_glyph(otmp, state);
            items.push({
                selector: otmp.invlet,
                label: donameFresh(otmp, state),
                value: otmp.invlet,
                glyphInfo,
            });
        }
    }
    if (query)
        throw new UnsupportedFeatureDescriptionError('a menu prompt');
    return menuOwner(items, state);
}

// C ref: invent.c display_inventory(). Its queued-key branch needs a command
// queue, which is not ported; nothing can push one yet.
export async function display_inventory(lets, want_reply, state, hooks) {
    return display_pickinv(
        lets, null, null, false, want_reply, state, hooks,
    );
}

// C ref: invent.c dispinv_with_action() (2964-3002). When lets has
// exactly one letter and menu_requested is off, menumode is false:
// display_pickinv() shows the item on the message line and returns 0,
// so itemactions() is never called.
export async function dispinv_with_action(lets, state = game, hooks = {}) {
    const len = lets ? lets.length : 0;
    const menumode = (len !== 1 || state.iflags.menu_requested);
    // The menu owner answers null for Escape, which is C's '\033' reaching
    // dispinv_with_action() without matching any invlet.
    const chosen = await display_inventory(lets, menumode, state, hooks);
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

// C ref: invent.c will_feel_cockatrice(). A sighted hero without forced touch
// never feels a corpse, whatever it is, so feel_cockatrice() is a no-op there.
export function will_feel_cockatrice(otmp, force_touch, state = game) {
    return Boolean((heroIsBlind(state) || force_touch)
        && !state.uarmg
        && !Stone_resistance(state)
        && otmp.otyp === CORPSE
        && touch_petrifies(state.mons[otmp.corpsenm]));
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
// relinking the live objects. `decorTerrain` projects describe_decor()'s
// preceding prev_decor write when check_here() has already admitted it.
// `obj_cnt` is invent.c's caller-owned parameter, deliberately independent of
// the floor chain: check_here() passes its count for pile_limit, while dolook()
// passes zero even when it inspects the same objects.
export function preflight_look_here(
    obj_cnt,
    lookhere_flags,
    state = game,
    { objects = null, decorTerrain = null } = {},
) {
    if (state.u.uswallow)
        throw new UnsupportedFeatureDescriptionError('an engulfer\'s inventory');

    const blind = heroIsBlind(state);
    const { ux, uy } = state.u;
    const skip_dfeature = (lookhere_flags & LOOKHERE_SKIP_DFEATURE) !== 0;
    const skip_objects = state.flags.pile_limit > 0
        && obj_cnt >= state.flags.pile_limit;
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
    const pickedSome = (lookhere_flags & LOOKHERE_PICKED_SOME) !== 0;

    if (hasPile) {
        if (!skip_objects && objectList.length > 4) {
            throw new UnsupportedFeatureDescriptionError(
                'an object pile outside the two-to-four-item window',
            );
        }
        if (skip_objects && pickedSome) {
            throw new UnsupportedFeatureDescriptionError(
                'the picked-some skipped-pile count',
            );
        }
        if (blind) {
            throw new UnsupportedFeatureDescriptionError(
                'a blind object-pile menu',
            );
        }
        if (state.flags.mention_decor) {
            const terrain = state.level.at(ux, uy)?.typ;
            if (skip_objects) {
                throw new UnsupportedFeatureDescriptionError(
                    'mention-decor pile-limit count',
                );
            }
            if ((terrain !== ROOM && terrain !== CORR)
                || (decorTerrain ?? state.iflags.prev_decor) !== terrain) {
                throw new UnsupportedFeatureDescriptionError(
                    'describe_decor() before an object-pile menu',
                );
            }
        }
        if (engr_at(ux, uy, state)) {
            throw new UnsupportedFeatureDescriptionError(
                'an engraving after an object-pile menu',
            );
        }
        if (is_lava(ux, uy, state)
            || (is_pool(ux, uy, state) && !state.u.uinwater)) {
            throw new UnsupportedFeatureDescriptionError(
                'objects on an inaccessible liquid square',
            );
        }
        if (!skip_objects) {
            for (const object of objectList) {
                if (withShopPrice)
                    assertPricedObjectNameable(object, state);
                else
                    assertObjectNameable(object, state);
            }
        }
    }

    const trap = t_at(ux, uy, state);
    // C ref: invent.c look_here() (4162-4178). This block is the only place
    // look_here() names a trap, and dfeature_at() has no trap arm at all, so an
    // unseen trap under the square changes nothing about what is printed. A
    // second, wider stop above this one used to refuse any trap beneath an
    // object pile, seen or not; it kept the hero from ever walking onto a pile
    // that hid a trap, which is the ordinary way a trap is met.
    if (!skip_objects) {
        const reg = visible_region_at(ux, uy, state);
        if (reg || (trap && trap.tseen)) {
            throw new UnsupportedFeatureDescriptionError(
                reg ? 'a visible region description' : 'trapname()',
            );
        }
    }

    let dfeature = dfeature_at(ux, uy, state);
    if (dfeature === 'pool of water' && state.u.uinwater) dfeature = null;
    let surf = null;
    let cant_reach;
    let cannotReachObjects;
    if (blind) {
        if (Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz))
            throw new UnsupportedFeatureDescriptionError('a drifting level');
        cant_reach = !can_reach_floor(undefined, state);
        surf = surface(ux, uy, state);
        cannotReachObjects = !can_reach_floor(
            Boolean(trap && is_pit(trap.ttyp)),
            state,
        );
    }

    if (skip_objects && !hasPile) {
        throw new UnsupportedFeatureDescriptionError(
            'the single-object skipped-pile count',
        );
    }
    if (otmp && !hasPile && !skip_objects) {
        if (will_feel_cockatrice(otmp, false, state))
            throw new UnsupportedFeatureDescriptionError('feel_cockatrice()');
        if (withShopPrice)
            assertPricedObjectNameable(otmp, state);
        else
            assertObjectNameable(otmp, state);
    }
    return {
        blind,
        cant_reach,
        cannotReachObjects,
        dfeature,
        hasPile,
        objectList,
        otmp,
        pickedSome,
        skip_dfeature,
        skip_objects,
        surf,
        withShopPrice,
    };
}

// C ref: invent.c look_here(). Covers a hero standing on an admitted square,
// sighted or blind: the terrain feature line, the engraving read, and the
// no-object, single-object, ordinary two-to-four-object menu, or sighted
// pile-limit count. Visible-region and seen-trap descriptions remain
// fail-closed before output. A sighted decorated pile includes its
// dfeature_at() line in either output path. Blindness is not excluded from the
// first two outcomes; a pile reached while blind stops before its tactile
// preamble because feel_cockatrice() and the tactile menu belong to a later
// slice. A liquid square, engraving, non-triggering pile outside two through
// four, or picked-some count likewise stops before output.
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
        dfeature,
        hasPile,
        otmp,
        pickedSome,
        skip_objects,
        surf,
        withShopPrice,
    } = plan;
    const verb = blind ? 'feel' : 'see';
    const { ux, uy } = state.u;
    let skip_dfeature = plan.skip_dfeature;
    if (blind) {
        await message(
            `You try to feel what is ${
                cant_reach ? 'lying beneath you' : `lying here on the ${surf}`
            }.`,
            state,
        );
        if (dfeature === surf) skip_dfeature = true;
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
        await message(`There are ${countName} objects here.`, state);
        return blind;
    }
    if (otmp.nexthere) {
        if (typeof displayObjectPile !== 'function')
            throw new TypeError('look_here needs an object-pile display owner');
        const lines = [];
        if (dfeature && !skip_dfeature) lines.push(fbuf, '');
        lines.push(`${pickedSome
            ? 'Other things' : 'Things'} that are here:`);
        for (let object = otmp; object; object = object.nexthere) {
            lines.push(withShopPrice
                ? doname_with_price(object, state, { currencyName: currency })
                : donameFresh(object, state));
        }
        await displayObjectPile(lines, state);
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
    return blind;
}

// C ref: invent.c dolook(). C hides the norep and noshow message types around
// the call so a player's MSGTYPE configuration cannot suppress this feedback;
// no message-type configuration is ported, so only look_here() remains.
export async function dolook(state = game, hooks = {}) {
    return look_here(0, LOOKHERE_NOFLAGS, state, hooks);
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
// Inventory effects: addSpecialInventoryEffects(obj, env),
// removeSpecialInventoryEffects(obj, env), recalculateLuck(obj, env),
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

// C ref: invent.c identify_pack() (2710-2744), restricted to the branch
// where no carried object still needs identification. The selection and
// automatic-identification branches have no running-game owner in this slice.
export async function identify_pack(idLimit, learningId, state = game) {
    const unidCount = count_unidentified(inventoryHead(state), state);
    if (unidCount) {
        throw new UnsupportedObjectOperationError(
            `identify_pack(${idLimit}) with ${unidCount} unidentified object(s)`,
        );
    }
    await ttyPline(
        `You have already identified ${learningId ? 'the rest' : 'all'} `
        + 'of your possessions.',
        state,
    );
    update_inventory({ state });
}

// C ref: invent.c learn_unseen_invent() (2750-2775). Called when the hero
// regains sight (e.g. removing a blindfold). Iterates inventory and marks
// items that were picked up while blind as seen, by calling xnameFresh()
// (which sets dknown via observe_object()) and triggering any reactions
// that seeing the object for the first time produces (addinv_core2).
//
// addinv_core2() handles two effects: set_moreluck() for luckstones and the
// Archeologist scroll-deciphering message. Those reactions are not yet
// ported here, so this function currently updates object knowledge without
// reproducing either reaction.
export function learn_unseen_invent(state = game) {
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
        // C ref: invent.c:2766. addinv_core2(otmp) handles luckstones and
        // Archeologist scroll deciphering; those reactions remain deferred.
    }
    if (invupdated)
        update_inventory({ state });
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
        // C calls impossible() here. The condition indicates a bug
        // elsewhere in inventory management, but the game continues.
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

// C ref: mkobj.c extract_nobj(). The replacement head stays private so a
// caller cannot forget to assign it back to its owner.
function extractNobj(obj, head) {
    let previous = null;
    let current = head;
    while (current && current !== obj) {
        previous = current;
        current = current.nobj;
    }
    if (!current)
        throw new Error(`extract_nobj: object ${obj?.o_id ?? '?'} is not on chain`);
    if (previous) previous.nobj = current.nobj;
    else head = current.nobj;
    obj.where = OBJ_FREE;
    obj.nobj = null;
    return head;
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

function container_weight(container, env) {
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
    if (confersLuck) {
        requiredHook(env, 'recalculateLuck', obj);
    } else if (obj.otyp === FIGURINE && obj.timed) {
        requiredHook(env, 'stopFigurineTimer', obj);
    }
    return { confersLuck };
}

function freeinvCore(obj, env, facts) {
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
            requiredHook(env, 'recalculateLuck', obj)(obj, env);
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
    normalized.state.invent = extractNobj(obj, inventoryHead(normalized.state));
    obj.pickup_prev = false;
    freeinvCore(obj, normalized, facts);
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
    case OBJ_ONBILL:
        requiredHook(env, 'extractExternalObject', obj);
        break;
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
        container.cobj = extractNobj(obj, container.cobj);
        obj.ocontainer = null;
        container_weight(container, normalized);
        return obj;
    }
    case OBJ_INVENT:
        return freeinv(obj, normalized);
    case OBJ_MINVENT:
        if (!obj.ocarry)
            throw new Error('obj_extract_self: monster object has no carrier');
        obj.ocarry.minvent = extractNobj(obj, obj.ocarry.minvent);
        obj.ocarry = null;
        return obj;
    case OBJ_BURIED:
        normalized.state.level.buriedobjlist = extractNobj(
            obj,
            buriedObjectHead(normalized.state),
        );
        return obj;
    case OBJ_FLOOR:
    case OBJ_MIGRATING:
    case OBJ_ONBILL:
        requiredHook(normalized, 'extractExternalObject', obj)(obj, normalized);
        if (obj.where !== OBJ_FREE)
            throw new Error('extractExternalObject must leave object OBJ_FREE');
        if (obj.nobj || obj.nexthere) {
            throw new Error(
                'extractExternalObject must clear object chain links',
            );
        }
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
// Both of C's shop calls stop by name: addtobill() and stolen_value() are
// shk.c's billing, which no ported command reaches. The hideunder() tail stops
// the same way, and its throw cannot fire at all: delobj() above it runs
// maybe_unhide_at() over the same square, and that refuses on u.uundetected
// alone, so a hidden hero never returns from the delete. What the tail's last
// term still decides is the hider who is not hidden, whom it must leave alone.
export function useupf(obj, numused, env = {}) {
    const normalized = inventoryEnv(env);
    const state = normalized.state;
    const at_u = u_at(obj.ox, obj.oy, state);

    /* "burn_floor_objects() keeps an object pointer that it tries to
     * useupf() multiple times, so obj must survive if plural" */
    const otmp = (obj.quan > numused)
        ? splitobj(obj, numused, normalized)
        : obj;
    if (!state.context?.mon_moving && costly_spot(otmp.ox, otmp.oy, state)) {
        throw new UnsupportedShopError('useupf() charging for shop goods');
    }
    delobj(otmp, normalized);
    if (at_u && state.u.uundetected && hides_under(state.youmonst?.data))
        throw new UnsupportedHideError('useupf() rehiding the hero');
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
    if (obj.otyp === CORPSE && obj.corpsenm >= 0) {
        const isReviver = requiredHook(normalized, 'isReviver', obj);
        if (isReviver(obj.corpsenm, normalized)) return false;
    }
    if (isCandle(obj)
        && Math.trunc(obj.age / 25) !== Math.trunc(otmp.age / 25)) {
        return false;
    }
    if (obj.otyp === POT_OIL && obj.lamplit) return false;
    if (obj.unpaid) {
        const samePrice = requiredHook(normalized, 'samePrice', obj);
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
    if (obj.unpaid || merge?.unpaid || obj.where === OBJ_ONBILL)
        requiredHook(env, 'obfreeShopBill', obj);
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

// C ref: shk.c obfree(). The general shop bill is not ported; encountering a
// billed object fails at that seam. Owned startup objects still preserve the
// source's o_id-based price adjustment when stacks merge.
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
        const disposition = requiredHook(env, 'obfreeShopBill', obj)(
            obj,
            merge,
            env,
        );
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
function mergedRuntime(otmp, obj, env = {}) {
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

function inventoryRank(obj) {
    if (typeof obj.invlet !== 'string' || !obj.invlet) return 0;
    return obj.invlet.charCodeAt(0) ^ 0o40;
}

function reorderInventory(state) {
    let needsSorting;
    do {
        needsSorting = false;
        let previous = null;
        let current = inventoryHead(state);
        while (current) {
            const next = current.nobj;
            if (next && inventoryRank(next) < inventoryRank(current)) {
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
    for (let obj = container.cobj; obj; obj = obj.nobj) {
        if (obj.oclass !== COIN_CLASS)
            obj.no_charge = false;
        if (obj.cobj) clearContainedNoCharge(obj);
    }
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

function addinvCore1(obj, env, facts) {
    if (obj.oclass === COIN_CLASS) {
        env.state.disp ??= {};
        env.state.disp.botl = true;
    } else if (obj.otyp === AMULET_OF_YENDOR
               || obj.otyp === CANDELABRUM_OF_INVOCATION
               || obj.otyp === BELL_OF_OPENING
               || obj.otyp === SPE_BOOK_OF_THE_DEAD) {
        requiredHook(env, 'addSpecialInventoryEffects', obj)(obj, env);
    } else if (obj.oartifact) {
        if (is_quest_artifact(obj, env.state)) {
            // invent.c:986-989 sets u.uhave.questart and calls artitouch().
            throw new UnsupportedObjectOperationError('quest artifact held',
                                                      obj);
        }
        set_artifact_intrinsic(obj, true, W_ART, env.state);
    }

    // C ref: invent.c addinv_core1().  Special-level creation sets nomerge
    // only until the tracked prize reaches the hero's inventory.
    if (facts.prize) {
        requiredHook(env, 'recordAchievement', obj)(
            facts.prize.achievement,
            env,
        );
        env.state.context.achieveo[facts.prize.oidField] = 0;
        obj.nomerge = false;
    }
}

function preflightAddinvCores(obj, env) {
    if (obj.otyp === AMULET_OF_YENDOR
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === BELL_OF_OPENING
        || obj.otyp === SPE_BOOK_OF_THE_DEAD) {
        requiredHook(env, 'addSpecialInventoryEffects', obj);
    } else if (obj.oartifact && is_quest_artifact(obj, env.state)) {
        // The next arm of the same if/else chain in addinvCore1(), projected
        // here for the reason the four otyps above are: addinv() clears
        // no_charge and how_lost before addinv_core1() runs, so the refusal
        // raised there would stop with the object already changed.
        throw new UnsupportedObjectOperationError('quest artifact held', obj);
    }
    const prize = specialPrize(obj, env.state);
    if (prize) requiredHook(env, 'recordAchievement', obj);
    const confersLuck = obj.otyp === LUCKSTONE
        || (Boolean(obj.oartifact) && confers_luck(obj, env.state));
    if (confersLuck) requiredHook(env, 'recalculateLuck', obj);
    if (env.state.urole?.filecode === 'Arc'
        && obj.oclass === SCROLL_CLASS
        && obj.otyp !== SCR_BLANK_PAPER
        && !isBlind(env)
        && !objectType(obj, env.state).oc_name_known) {
        requiredHook(env, 'archeologistDeciphersScroll', obj);
    }
    return { confersLuck, prize };
}

function addinvCore2(obj, env, facts) {
    if (obj.otyp === LUCKSTONE || obj.oartifact) {
        if (facts.confersLuck)
            requiredHook(env, 'recalculateLuck', obj)(obj, env);
    }

    // The Archeologist's scroll-label side effect can become reachable only
    // after its startup inventory changes; keep it behind a named seam.
    if (env.state.urole?.filecode === 'Arc'
        && obj.oclass === SCROLL_CLASS
        && obj.otyp !== SCR_BLANK_PAPER
        && !isBlind(env)
        && !objectType(obj, env.state).oc_name_known) {
        requiredHook(env, 'archeologistDeciphersScroll', obj)(obj, env);
    }
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
function isThrowingWeapon(obj, state) {
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
                if (fixedLetters) reorderInventory(state);
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

    addinvCore1(obj, normalized, addinvFacts);
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
        if (fixedLetters) reorderInventory(state);
    } else {
        previous.nobj = obj;
        obj.nobj = null;
    }
    obj.where = OBJ_INVENT;
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
        && willConsiderAutoquiver
        && shouldAutoquiver(obj, state))
        setQuiver(obj, normalized);
    obj.pickup_prev = true;
    addinvCore2(obj, normalized, addinvFacts);
    carry_obj_effects(obj, normalized, carryEffects);
    if (updatePermInvent) update_inventory(normalized);
    return obj;
}

// C ref: invent.c addinv_core0().
function addinvCore0(
    obj, env = {}, prepared = null, updatePermInvent,
) {
    const context = beginAddinv(obj, env, prepared);
    if (!context) return null;
    const { normalized, state } = context;
    let inserted = false;
    if (state.uquiver && merged(state.uquiver, obj, normalized)) {
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
    return addinvCore0(obj, env, prepared, true);
}

// Live counterpart of addinv_core0().  It leaves the synchronous API to
// generation and startup callers while allowing invent.c merged()'s pline()
// to suspend before obfree() and the addinv_core0() tail.  Every live caller
// belongs here: C prints that message before it frees the incoming object and
// before its own caller's prinv(), and only an awaited merge reproduces that
// order.
async function addinvCore0Runtime(
    obj, env = {}, prepared = null, updatePermInvent,
) {
    const context = beginAddinv(obj, env, prepared);
    if (!context) return null;
    const { normalized, state } = context;
    let inserted;
    let mergedObject;

    if (state.uquiver) {
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
// The price column at 2926-2936, which a shop's unpaid or expended items use,
// is the only other shape; `cost` is 0 and `let` is never '*' for the pickup
// and acquisition messages this port reaches.
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
        if (cost !== 0 || letter === '*')
            throw new UnsupportedObjectOperationError('xprname price', obj);
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

        if (!touch_artifact(obj, state.youmonst, normalized)) {
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
// currencies[] through ROLL_FROM(), which draws from the display RNG; that
// branch is not ported, so a hallucinating hero stops here.
export function currency(amount, state = game) {
    if (isHallucinating({ state }))
        throw new UnsupportedFeatureDescriptionError('hallucinated currency');
    const res = 'zorkmid';
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
}

// C ref: shk.c shopper_financial_report(). Reports shop credit and debt.
async function shopper_financial_report(state) {
    const { inside_shop, shop_keeper } = await import('./shk.js');
    const thisShkp = shop_keeper(inside_shop(state.u.ux, state.u.uy, state), state);
    if (thisShkp && !thisShkp.eshk?.credit && !thisShkp.eshk?.debit
        && !thisShkp.eshk?.robbed) {
        await ttyPline('You have no credit or debt in here.', state);
        return;
    }
    if (!thisShkp) {
        for (let mtmp = state.fmon; mtmp; mtmp = mtmp.nmon) {
            if (mtmp.deadMonster) continue;
            if (!mtmp.isshk) continue;
            const eshk = mtmp.eshk;
            if (!eshk) continue;
            if (eshk.credit) {
                await ttyPline(
                    `You have ${eshk.credit} ${currency(eshk.credit, state)} `
                    + `credit at ${mtmp.mname || 'the shopkeeper'}'s `
                    + `${eshk.shopName || 'shop'}.`,
                    state,
                );
            }
            if (eshk.debit) {
                await ttyPline(
                    `You owe ${mtmp.mname || 'the shopkeeper'} `
                    + `${eshk.debit} ${currency(eshk.debit, state)}.`,
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
        await prinv(null, state.uwep, 0);
        if (state.u.twoweap)
            await prinv(null, state.uswapwep, 0);
    } else {
        let lets = '';
        lets += obj_to_let(state.uwep, state);
        if (state.uswapwep)
            lets += state.uswapwep.invlet;
        if (state.uquiver)
            lets += state.uquiver.invlet;
        await dispinv_with_action(lets, state, hooks);
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
            uskinname = uskinname.slice(0, dragonIdx) + uskinname.slice(dragonIdx + 7);
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
        await dispinv_with_action(lets, state, hooks);
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
        await dispinv_with_action(lets, state, hooks);
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
        await dispinv_with_action(lets, state, hooks);
    }
    return ECMD_OK;
}
