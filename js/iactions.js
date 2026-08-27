// Item-actions menu: show the player what they can do with an inventory
// object, then queue the chosen command.
// C ref: src/iactions.c (all five functions).

import {
    CQ_CANNED,
    ECMD_OK,
    FINGER,
    GETOBJ_SUGGEST,
    HAND,
    HANDS_SYM,
    Has_contents,
    IS_ALTAR,
    ONAME,
    PICK_ONE,
    SHOPBASE,
    W_ACCESSORY,
    W_AMUL,
    W_ARMOR,
    W_RING,
    W_TOOL,
    has_oname,
    plur,
} from './const.js';
import {
    cmdq_add_ec,
    cmdq_add_key,
    extcmdRow,
} from './cmd.js';
import { name_ok, call_ok } from './do_name.js';
import { is_edible } from './eat.js';
import { game } from './gstate.js';
import { check_invent_gold, carrying } from './invent.js';
import { could_twoweap } from './mondata.js';
import {
    ammo_and_launcher,
    isContainer,
    is_ammo,
    is_blade,
    is_graystone,
    is_launcher,
    is_missile,
    is_weptool,
    is_wet_towel,
    objectType,
} from './obj.js';
import {
    AMULET_CLASS,
    AMULET_OF_YENDOR,
    ARMOR_CLASS,
    BAG_OF_TRICKS,
    BEARTRAP,
    BELL,
    BELL_OF_OPENING,
    BLINDFOLD,
    BRASS_LANTERN,
    BULLWHIP,
    CAN_OF_GREASE,
    CANDELABRUM_OF_INVOCATION,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    CREDIT_CARD,
    CRYSTAL_BALL,
    DRUM_OF_EARTHQUAKE,
    DWARVISH_MATTOCK,
    EUCALYPTUS_LEAF,
    EXPENSIVE_CAMERA,
    FAKE_AMULET_OF_YENDOR,
    FIGURINE,
    FORTUNE_COOKIE,
    GEM_CLASS,
    GOLD_PIECE,
    GRAPPLING_HOOK,
    HAWAIIAN_SHIRT,
    HEAVY_IRON_BALL,
    HORN_OF_PLENTY,
    ALCHEMY_SMOCK,
    LAND_MINE,
    LEASH,
    LENSES,
    LOCK_PICK,
    MAGIC_LAMP,
    MAGIC_MARKER,
    MAGIC_WHISTLE,
    MEAT_RING,
    MIRROR,
    OIL_LAMP,
    PICK_AXE,
    POTION_CLASS,
    POT_OIL,
    RING_CLASS,
    SADDLE,
    SCR_BLANK_PAPER,
    SCR_MAIL,
    SCROLL_CLASS,
    SKELETON_KEY,
    SPBOOK_CLASS,
    SPE_BLANK_PAPER,
    SPE_BOOK_OF_THE_DEAD,
    SPE_NOVEL,
    STETHOSCOPE,
    TALLOW_CANDLE,
    T_SHIRT,
    TIN,
    TINNING_KIT,
    TIN_OPENER,
    TIN_WHISTLE,
    TOOL_CLASS,
    TOWEL,
    UNICORN_HORN,
    WAND_CLASS,
    WAX_CANDLE,
    WEAPON_CLASS,
    WOODEN_FLUTE,
} from './objects.js';
import {
    an,
    armor_simple_name,
    cxname,
    is_plural,
    simpleonames,
    the,
    the_unique_obj,
} from './objnam.js';
import { makeplural } from './fruit.js';
import { body_part } from './polyself.js';
import { surface } from './dungeon.js';
import { in_rooms } from './rooms.js';
import { shop_keeper, inhishop } from './shk.js';
import { cantwield } from './wield.js';
import {
    bimanual,
    armcat_to_wornmask,
    wearmask_to_obj,
} from './worn.js';
import { select_menu } from './windows.js';

// C ref: iactions.c enum item_action_actions (13-42).
const IA_NONE            = 0;
const IA_UNWIELD         = 1;
const IA_APPLY_OBJ       = 2;
const IA_DIP_OBJ         = 3;
const IA_NAME_OBJ        = 4;
const IA_NAME_OTYP       = 5;
const IA_DROP_OBJ        = 6;
const IA_EAT_OBJ         = 7;
const IA_ENGRAVE_OBJ     = 8;
const IA_FIRE_OBJ        = 9;
const IA_ADJUST_OBJ      = 10;
const IA_ADJUST_STACK    = 11;
const IA_SACRIFICE       = 12;
const IA_BUY_OBJ         = 13;
const IA_QUAFF_OBJ       = 14;
const IA_QUIVER_OBJ      = 15;
const IA_READ_OBJ        = 16;
const IA_RUB_OBJ         = 17;
const IA_THROW_OBJ       = 18;
const IA_TAKEOFF_OBJ     = 19;
const IA_TIP_CONTAINER   = 20;
const IA_INVOKE_OBJ      = 21;
const IA_WIELD_OBJ       = 22;
const IA_WEAR_OBJ        = 23;
const IA_SWAPWEAPON      = 24;
const IA_TWOWEAPON       = 25;
const IA_ZAP_OBJ         = 26;
const IA_WHATIS_OBJ      = 27;

// C ref: iactions.c item_naming_classification() (45-82). Builds the text
// for the name-individual ('c') and call-type ('C') menu entries.
// Returns { onamebuf, ocallbuf } with non-empty strings for applicable
// entries, or both empty when neither applies.
function item_naming_classification(obj, state) {
    let onamebuf = '';
    let ocallbuf = '';
    if (name_ok(obj, state) === GETOBJ_SUGGEST) {
        const article = the_unique_obj(obj, state)
            ? 'the'
            : !is_plural(obj) ? 'this specific' : 'this stack of';
        const nameOrRename = (!has_oname(obj) || !ONAME(obj))
            ? 'Name' : 'Rename or un-name';
        onamebuf = `${nameOrRename} ${article} ${simpleonames(obj, state)}`;
    }
    if (call_ok(obj, state) === GETOBJ_SUGGEST) {
        let callname = simpleonames(obj, state);
        if (the_unique_obj(obj, state))
            callname = the(callname, state);
        else if (!is_plural(obj))
            callname = makeplural(callname);
        const type = objectType(obj, state);
        const callOrRecall = (!type.oc_uname || !type.oc_uname)
            ? 'Call' : 'Re-call or un-call';
        ocallbuf = `${callOrRecall} the type for ${callname}`;
    }
    return { onamebuf, ocallbuf };
}

// C ref: iactions.c item_reading_classification() (85-124). Returns the
// reading action constant (IA_READ_OBJ or IA_NONE) and the menu text.
function item_reading_classification(obj, state) {
    const otyp = obj.otyp;
    let outbuf = '';
    let res = IA_READ_OBJ;

    if (otyp === FORTUNE_COOKIE) {
        outbuf = 'Read the message inside this cookie';
    } else if (otyp === T_SHIRT) {
        outbuf = 'Read the slogan on the shirt';
    } else if (otyp === ALCHEMY_SMOCK) {
        outbuf = 'Read the slogan on the apron';
    } else if (otyp === HAWAIIAN_SHIRT) {
        outbuf = 'Look at the pattern on the shirt';
    } else if (obj.oclass === SCROLL_CLASS) {
        // SCR_MAIL is excluded from the "activate its magic" text because
        // C guards it with #ifdef MAIL_STRUCTURES.
        const magic = (obj.dknown
            && otyp !== SCR_MAIL
            && (otyp !== SCR_BLANK_PAPER
                || !state.objects[otyp].oc_name_known))
            ? ' to activate its magic' : '';
        outbuf = `Read this scroll${magic}`;
    } else if (obj.oclass === SPBOOK_CLASS) {
        const novel = otyp === SPE_NOVEL;
        const blank = otyp === SPE_BLANK_PAPER
            && state.objects[otyp].oc_name_known;
        const tome = otyp === SPE_BOOK_OF_THE_DEAD
            && state.objects[otyp].oc_name_known;
        const verb = (novel || blank) ? 'Read' : tome ? 'Examine' : 'Study';
        const noun = novel ? simpleonames(obj, state)
            : tome ? 'tome' : 'spellbook';
        outbuf = `${verb} this ${noun}`;
    } else {
        res = IA_NONE;
    }
    return { res, outbuf };
}

// C ref: iactions.c ia_addmenu() (126-136). Builds a menu item object.
function ia_addmenu(items, act, letter, txt) {
    items.push({
        selector: letter,
        label: txt,
        value: act,
    });
}

// C ref: iactions.c itemactions_pushkeys() (139-274). Queues the command
// and inventory letter onto the canned command queue so that rhack() runs
// the chosen action on the next iteration.
function itemactions_pushkeys(otmp, act, state) {
    switch (act) {
    default:
        // C calls impossible() here.
        break;
    case IA_NONE:
        break;
    case IA_UNWIELD:
        cmdq_add_ec(CQ_CANNED,
            otmp === state.uwep ? extcmdRow('wield')
            : otmp === state.uswapwep ? extcmdRow('altunwield')
            : otmp === state.uquiver ? extcmdRow('quiver')
            : extcmdRow('wait'), // can't happen
            state);
        cmdq_add_key(CQ_CANNED, HANDS_SYM, state);
        break;
    case IA_APPLY_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('apply'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_DIP_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('altdip'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_NAME_OBJ:
    case IA_NAME_OTYP:
        cmdq_add_ec(CQ_CANNED, extcmdRow('call'), state);
        cmdq_add_key(CQ_CANNED, act === IA_NAME_OBJ ? 'i' : 'o', state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_DROP_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('drop'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_EAT_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('reqmenu'), state);
        cmdq_add_ec(CQ_CANNED, extcmdRow('eat'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_ENGRAVE_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('engrave'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_FIRE_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('fire'), state);
        break;
    case IA_ADJUST_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('adjust'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_ADJUST_STACK:
        cmdq_add_ec(CQ_CANNED, extcmdRow('altadjust'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_SACRIFICE:
        cmdq_add_ec(CQ_CANNED, extcmdRow('offer'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_BUY_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('pay'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_QUAFF_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('reqmenu'), state);
        cmdq_add_ec(CQ_CANNED, extcmdRow('quaff'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_QUIVER_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('quiver'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_READ_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('read'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_RUB_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('rub'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_THROW_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('throw'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_TAKEOFF_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('alttakeoff'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_TIP_CONTAINER:
        cmdq_add_ec(CQ_CANNED, extcmdRow('reqmenu'), state);
        cmdq_add_ec(CQ_CANNED, extcmdRow('tip'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_INVOKE_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('invoke'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_WIELD_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('wield'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_WEAR_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('wear'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_SWAPWEAPON:
        cmdq_add_ec(CQ_CANNED, extcmdRow('swap'), state);
        break;
    case IA_TWOWEAPON:
        cmdq_add_ec(CQ_CANNED, extcmdRow('twoweapon'), state);
        break;
    case IA_ZAP_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('zap'), state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    case IA_WHATIS_OBJ:
        cmdq_add_ec(CQ_CANNED, extcmdRow('whatis'), state);
        cmdq_add_key(CQ_CANNED, 'i', state);
        cmdq_add_key(CQ_CANNED, otmp.invlet, state);
        break;
    }
}

// C ref: pager.c ia_checkfile() (807-815). Checks whether the game's
// data.base file has an entry for this object. Since the data.base file
// is a filesystem resource that the JS port cannot access in game code,
// this always returns false and the '/' menu entry is never shown.
function ia_checkfile(_otmp) {
    return false;
}

// C ref: iactions.c itemactions() (278-714). Shows a menu of possible
// actions for the given object and, on selection, queues the chosen
// command via itemactions_pushkeys().
export async function itemactions(otmp, state = game, hooks = {}) {
    const items = [];
    const type = objectType(otmp, state);
    const light = otmp.lamplit ? 'Extinguish' : 'Light';
    const already_worn = (otmp.owornmask & (W_ARMOR | W_ACCESSORY)) !== 0;

    // -: unwield (C:293-307)
    if (otmp === state.uwep || otmp === state.uswapwep
        || otmp === state.uquiver) {
        const verb = otmp === state.uquiver ? 'Quiver' : 'Wield';
        const action = otmp === state.uquiver ? 'un-ready' : 'un-wield';
        const which = is_plural(otmp) ? 'these' : 'this';
        let what = (otmp.oclass === WEAPON_CLASS || is_weptool(otmp, state))
            ? 'weapon' : 'item';
        if (is_plural(otmp)) what = makeplural(what);
        ia_addmenu(items, IA_UNWIELD, '-',
            `${verb} '${HANDS_SYM}' to ${action} ${which} ${what}`);
    }

    // a: apply (C:310-401)
    if (otmp.oclass === COIN_CLASS)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Flip a coin');
    else if (otmp.otyp === CREAM_PIE)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Hit yourself with this cream pie');
    else if (otmp.otyp === BULLWHIP)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Lash out with this whip');
    else if (otmp.otyp === GRAPPLING_HOOK)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Grapple something with this hook');
    else if (otmp.otyp === BAG_OF_TRICKS
        && state.objects[otmp.otyp].oc_name_known)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Reach into this bag');
    else if (isContainer(otmp))
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Open this container');
    else if (otmp.otyp === CAN_OF_GREASE)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Use the can to grease an item');
    else if (otmp.otyp === LOCK_PICK || otmp.otyp === CREDIT_CARD
        || otmp.otyp === SKELETON_KEY)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Use this tool to pick a lock');
    else if (otmp.otyp === TINNING_KIT)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Use this kit to tin a corpse');
    else if (otmp.otyp === LEASH)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Tie a pet to this leash');
    else if (otmp.otyp === SADDLE)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Place this saddle on a pet');
    else if (otmp.otyp === MAGIC_WHISTLE || otmp.otyp === TIN_WHISTLE)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Blow this whistle');
    else if (otmp.otyp === EUCALYPTUS_LEAF)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Use this leaf as a whistle');
    else if (otmp.otyp === STETHOSCOPE)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Listen through the stethoscope');
    else if (otmp.otyp === MIRROR)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Show something its reflection');
    else if (otmp.otyp === BELL || otmp.otyp === BELL_OF_OPENING)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Ring the bell');
    else if (otmp.otyp === CANDELABRUM_OF_INVOCATION) {
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            `${light} the candelabrum`);
    } else if (otmp.otyp === WAX_CANDLE || otmp.otyp === TALLOW_CANDLE) {
        const multiple = otmp.quan !== 1;
        const s = multiple ? 'these' : 'this';
        const o = carrying(CANDELABRUM_OF_INVOCATION, state);
        let buf;
        if (o && o.spe < 7) {
            const lit = !otmp.lamplit ? 'light' : 'extinguish';
            const them = multiple ? 'them' : 'it';
            buf = `Attach ${s} to your candelabrum, or ${lit} ${them}`;
        } else {
            buf = `${light} ${s} ${simpleonames(otmp, state)}`;
        }
        ia_addmenu(items, IA_APPLY_OBJ, 'a', buf);
    } else if (otmp.otyp === OIL_LAMP || otmp.otyp === MAGIC_LAMP
        || otmp.otyp === BRASS_LANTERN) {
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            `${light} this light source`);
    } else if (otmp.otyp === POT_OIL
        && state.objects[otmp.otyp].oc_name_known) {
        ia_addmenu(items, IA_APPLY_OBJ, 'a', `${light} this oil`);
    } else if (otmp.oclass === POTION_CLASS) {
        const these = is_plural(otmp) ? 'one of these' : 'this';
        ia_addmenu(items, IA_DIP_OBJ, 'a',
            `Dip something into ${these} potion${plur(otmp.quan)}`);
    } else if (otmp.otyp === EXPENSIVE_CAMERA)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Take a photograph');
    else if (otmp.otyp === TOWEL)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Clean yourself off with this towel');
    else if (otmp.otyp === CRYSTAL_BALL)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Peer into this crystal ball');
    else if (otmp.otyp === MAGIC_MARKER)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Write on something with this marker');
    else if (otmp.otyp === FIGURINE)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Make this figurine transform');
    else if (otmp.otyp === UNICORN_HORN)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Use this unicorn horn');
    else if (otmp.otyp === HORN_OF_PLENTY
        && state.objects[otmp.otyp].oc_name_known)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Blow into the horn of plenty');
    else if (otmp.otyp >= WOODEN_FLUTE && otmp.otyp <= DRUM_OF_EARTHQUAKE)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Play this musical instrument');
    else if (otmp.otyp === LAND_MINE || otmp.otyp === BEARTRAP)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Arm this trap');
    else if (otmp.otyp === PICK_AXE || otmp.otyp === DWARVISH_MATTOCK)
        ia_addmenu(items, IA_APPLY_OBJ, 'a',
            'Dig with this digging tool');
    else if (otmp.oclass === WAND_CLASS)
        ia_addmenu(items, IA_APPLY_OBJ, 'a', 'Break this wand');

    // c, C: name an item or its type (C:402-408)
    const { onamebuf, ocallbuf } = item_naming_classification(otmp, state);
    if (onamebuf || ocallbuf) {
        if (onamebuf) ia_addmenu(items, IA_NAME_OBJ, 'c', onamebuf);
        if (ocallbuf) ia_addmenu(items, IA_NAME_OTYP, 'C', ocallbuf);
    }

    // d: drop (C:410-416)
    if (!already_worn) {
        ia_addmenu(items, IA_DROP_OBJ, 'd',
            `Drop this ${otmp.quan > 1 ? 'stack' : 'item'}`);
    }

    // e: eat (C:418-428)
    if (otmp.otyp === TIN) {
        const tinDesc = otmp.quan > 1 ? 'one of these tins' : 'this tin';
        const opener = (state.uwep && state.uwep.otyp === TIN_OPENER)
            ? ' with your tin opener' : '';
        ia_addmenu(items, IA_EAT_OBJ, 'e',
            `Open ${tinDesc}${opener} and eat the contents`);
    } else if (is_edible(otmp, state)) {
        ia_addmenu(items, IA_EAT_OBJ, 'e',
            `Eat ${otmp.quan > 1 ? 'one of these' : 'this'}`);
    }

    // E: engrave (C:430-446)
    if (otmp.otyp === TOWEL) {
        ia_addmenu(items, IA_ENGRAVE_OBJ, 'E',
            'Wipe the floor with this towel');
    } else if (otmp.otyp === MAGIC_MARKER) {
        ia_addmenu(items, IA_ENGRAVE_OBJ, 'E',
            'Scribble graffiti on the floor');
    } else if (otmp.oclass === WEAPON_CLASS || otmp.oclass === WAND_CLASS
        || otmp.oclass === GEM_CLASS || otmp.oclass === RING_CLASS) {
        const verb = (is_blade(otmp, state) || otmp.oclass === WAND_CLASS
            || ((otmp.oclass === GEM_CLASS || otmp.oclass === RING_CLASS)
                && state.objects[otmp.otyp].oc_tough))
            ? 'Engrave' : 'Write';
        const withItem = otmp.quan > 1
            ? 'one of these items' : 'this item';
        ia_addmenu(items, IA_ENGRAVE_OBJ, 'E',
            `${verb} on the ${surface(state.u.ux, state.u.uy, state)} with ${withItem}`);
    }

    // f: fire quivered ammo (C:448-460)
    if (otmp === state.uquiver) {
        const shoot = ammo_and_launcher(otmp, state.uwep, state);
        const these = otmp.quan > 1 ? 'one of these' : 'this';
        let buf = `${shoot ? 'Shoot' : 'Throw'} ${these}`;
        if (shoot && state.uwep) {
            buf += ` with your wielded ${simpleonames(state.uwep, state)}`;
        }
        ia_addmenu(items, IA_FIRE_OBJ, 'f', buf);
    }

    // i: adjust inventory letter (C:462-466)
    if (otmp.oclass !== COIN_CLASS || check_invent_gold('item-action', state))
        ia_addmenu(items, IA_ADJUST_OBJ, 'i',
            'Adjust inventory by assigning new letter');
    // I: adjust by splitting stack (C:467-469)
    if (otmp.quan > 1 && otmp.oclass !== COIN_CLASS)
        ia_addmenu(items, IA_ADJUST_STACK, 'I',
            'Adjust inventory by splitting this stack');

    // O: offer sacrifice (C:472-483)
    if (IS_ALTAR(state.level.at(state.u.ux, state.u.uy).typ)
        && !state.u.uswallow) {
        if (otmp.otyp === CORPSE)
            ia_addmenu(items, IA_SACRIFICE, 'O',
                'Offer this corpse as a sacrifice at this altar');
        else if (otmp.otyp === AMULET_OF_YENDOR
            || otmp.otyp === FAKE_AMULET_OF_YENDOR)
            ia_addmenu(items, IA_SACRIFICE, 'O',
                'Offer this amulet as a sacrifice at this altar');
    }

    // p: pay (C:485-494)
    if (otmp.unpaid) {
        const mtmp = shop_keeper(
            (in_rooms(state.u.ux, state.u.uy, SHOPBASE, state) ?? '')[0]
                ?? '\0',
            state);
        if (mtmp && inhishop(mtmp, state)) {
            ia_addmenu(items, IA_BUY_OBJ, 'p',
                `Buy this unpaid ${otmp.quan > 1 ? 'stack' : 'item'}`);
        }
    }

    // P: put on accessory (C:496-525)
    if (!already_worn) {
        let buf = '';
        if (otmp.oclass === AMULET_CLASS) {
            buf = !state.uamul ? 'Put this amulet on'
                : '[already wearing an amulet]';
        } else if (otmp.oclass === RING_CLASS || otmp.otyp === MEAT_RING) {
            if (!state.uleft || !state.uright)
                buf = 'Put this ring on';
            else
                buf = `[both ring ${makeplural(body_part(FINGER, state.youmonst))} in use]`;
        } else if (otmp.otyp === BLINDFOLD || otmp.otyp === TOWEL
            || otmp.otyp === LENSES) {
            if (state.ublindf)
                buf = '[already wearing eyewear]';
            else if (otmp.otyp === LENSES)
                buf = 'Put these lenses on';
            else
                buf = `Put this on${otmp.otyp === TOWEL ? ' to blindfold yourself' : ''}`;
        }
        if (buf) ia_addmenu(items, IA_WEAR_OBJ, 'P', buf);
    }

    // q: drink (C:527-532)
    if (otmp.oclass === POTION_CLASS) {
        ia_addmenu(items, IA_QUAFF_OBJ, 'q',
            `Quaff (drink) ${otmp.quan > 1 ? 'one of these potions' : 'this potion'}`);
    }

    // Q: quiver (C:534-541)
    if ((otmp.oclass === GEM_CLASS || otmp.oclass === WEAPON_CLASS)
        && otmp !== state.uquiver) {
        const stackOrItem = otmp.quan > 1 ? 'stack' : 'item';
        const shootOrThrow = ammo_and_launcher(otmp, state.uwep, state)
            ? 'shooting' : 'throwing';
        ia_addmenu(items, IA_QUIVER_OBJ, 'Q',
            `Quiver this ${stackOrItem} for easy ${shootOrThrow} with 'f'ire`);
    }

    // r: read (C:543-545)
    const readResult = item_reading_classification(otmp, state);
    if (readResult.res === IA_READ_OBJ)
        ia_addmenu(items, IA_READ_OBJ, 'r', readResult.outbuf);

    // R: remove accessory or rub (C:547-561)
    if (otmp.owornmask & W_ACCESSORY) {
        const what = (otmp.owornmask & W_AMUL) ? 'amulet'
            : (otmp.owornmask & W_RING) ? 'ring'
            : (otmp.owornmask & W_TOOL) ? 'eyewear'
            : 'accessory';
        ia_addmenu(items, IA_TAKEOFF_OBJ, 'R', `Remove this ${what}`);
    }
    if (otmp.otyp === OIL_LAMP || otmp.otyp === MAGIC_LAMP
        || otmp.otyp === BRASS_LANTERN) {
        ia_addmenu(items, IA_RUB_OBJ, 'R',
            `Rub this ${simpleonames(otmp, state)}`);
    } else if (otmp.oclass === GEM_CLASS && is_graystone(otmp)) {
        ia_addmenu(items, IA_RUB_OBJ, 'R',
            'Rub something on this stone');
    }

    // t: throw (C:563-587)
    if (!already_worn) {
        const shoot = ammo_and_launcher(otmp, state.uwep, state);
        const item = otmp.quan === 1 ? 'this item'
            : otmp.otyp === GOLD_PIECE ? 'them'
            : 'one of these';
        const suffix = (otmp === state.uquiver
            && (otmp.otyp !== GOLD_PIECE || otmp.quan === 1))
            ? " (same as 'f')" : '';
        ia_addmenu(items, IA_THROW_OBJ, 't',
            `${shoot ? 'Shoot' : 'Throw'} ${item}${suffix}`);
    }

    // T: take off armor, tip container (C:589-596)
    if (otmp.owornmask & W_ARMOR)
        ia_addmenu(items, IA_TAKEOFF_OBJ, 'T', 'Take off this armor');
    if ((isContainer(otmp) && (Has_contents(otmp) || !otmp.cknown))
        || (otmp.otyp === HORN_OF_PLENTY
            && (otmp.spe > 0 || !otmp.known)))
        ia_addmenu(items, IA_TIP_CONTAINER, 'T',
            'Tip all the contents out of this container');

    // V: invoke (C:597-604)
    if ((otmp.otyp === FAKE_AMULET_OF_YENDOR && !otmp.known)
        || otmp.oartifact || type.oc_unique
        || otmp.otyp === CRYSTAL_BALL)
        ia_addmenu(items, IA_INVOKE_OBJ, 'V',
            'Try to invoke a unique power of this object');

    // w: wield (C:606-629)
    if (otmp === state.uwep || cantwield(state.youmonst?.data)) {
        // skip
    } else if (otmp.oclass === WEAPON_CLASS || is_weptool(otmp, state)
        || is_wet_towel(otmp) || otmp.otyp === HEAVY_IRON_BALL) {
        ia_addmenu(items, IA_WIELD_OBJ, 'w',
            `Wield this ${otmp.quan > 1 ? 'stack' : 'item'} as your weapon`);
    } else if (otmp.otyp === TIN_OPENER) {
        ia_addmenu(items, IA_WIELD_OBJ, 'w',
            'Wield the tin opener to easily open tins');
    } else if (!already_worn) {
        ia_addmenu(items, IA_WIELD_OBJ, 'w',
            `Wield this ${otmp.quan > 1 ? 'stack' : 'item'} in your ${makeplural(body_part(HAND, state.youmonst))}`);
    }

    // W: wear armor (C:631-649)
    if (!already_worn) {
        if (otmp.oclass === ARMOR_CLASS) {
            const Wmask = armcat_to_wornmask(type.oc_armcat);
            const o = wearmask_to_obj(Wmask, state);
            let buf;
            if (!o)
                buf = 'Wear this armor';
            else
                buf = `[already wearing ${an(armor_simple_name(o, state))}]`;
            ia_addmenu(items, IA_WEAR_OBJ, 'W', buf);
        }
    }

    // x: swap weapons (C:651-660)
    if (otmp === state.uwep && state.uswapwep)
        ia_addmenu(items, IA_SWAPWEAPON, 'x',
            'Swap this with your alternate weapon');
    else if (otmp === state.uwep)
        ia_addmenu(items, IA_SWAPWEAPON, 'x',
            'Ready this as an alternate weapon');
    else if (otmp === state.uswapwep)
        ia_addmenu(items, IA_SWAPWEAPON, 'x',
            'Swap this with your main weapon');

    // X: toggle two-weapon (C:662-682)
    // C's MAYBETWOWEAPON macro:
    const maybeTwoweapon = (obj) =>
        ((obj.oclass === WEAPON_CLASS)
            ? !(is_launcher(obj, state) || is_ammo(obj, state)
                || is_missile(obj, state))
            : is_weptool(obj, state))
        && !bimanual(obj, state);

    if ((otmp === state.uwep || otmp === state.uswapwep)
        && (state.u.twoweap
            || (could_twoweap(state.youmonst?.data) && !state.uarms
                && state.uwep && maybeTwoweapon(state.uwep)
                && state.uswapwep && maybeTwoweapon(state.uswapwep)))) {
        ia_addmenu(items, IA_TWOWEAPON, 'X',
            `Toggle two-weapon combat ${state.u.twoweap ? 'off' : 'on'}`);
    }

    // z: zap wand (C:686-689)
    if (otmp.oclass === WAND_CLASS)
        ia_addmenu(items, IA_ZAP_OBJ, 'z',
            'Zap this wand to release its magic');

    // /: look up in database (C:691-696)
    // ia_checkfile() is stubbed to false because data.base is not available.
    if (ia_checkfile(otmp)) {
        ia_addmenu(items, IA_WHATIS_OBJ, '/',
            `Look up information about ${otmp.quan > 1 ? 'these' : 'this'}`);
    }

    // Menu title: "Do what with <item>?" (C:698)
    const title = `Do what with ${the(cxname(otmp, state), state)}?`;

    // C ref: iactions.c:701. PICK_ONE select_menu, separate from the
    // inventory menu that brought us here: the hooks.menu from the
    // caller handles the inventory listing and must not be reused.
    const chooseMenu = hooks.selectMenu ?? select_menu;
    const n = await chooseMenu(state, {
        items,
        how: PICK_ONE,
        cancelValue: null,
        title,
        overlay: state.iflags?.menu_overlay !== false,
    });

    if (n != null) {
        // select_menu with PICK_ONE returns the selected item's value
        itemactions_pushkeys(otmp, n, state);
    }

    return ECMD_OK;
}
