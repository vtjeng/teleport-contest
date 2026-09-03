// Monster names, naming commands, and novel-title data.
// C ref: src/do_name.c docallcmd(), christen_monst(), docall(),
// rndghostname(), bogusmon(), rndmonnam(),
// sir_Terry_novels[], noveltitle(), and lookup_novel().

import {
    ARTICLE_A,
    ARTICLE_NONE,
    ARTICLE_THE,
    ARTICLE_YOUR,
    AUGMENT_IT,
    BLINDED,
    BOGUSMONFILE,
    CORPSTAT_FEMALE,
    CORPSTAT_GENDER,
    CORPSTAT_MALE,
    CORPSTAT_RANDOM,
    ECMD_OK,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    FEMALE,
    HALLUC,
    HALLUC_RES,
    ismnum,
    MALE,
    MD_PAD_BOGONS,
    M_AP_MONSTER,
    M_AP_TYPMASK,
    NEUTRAL,
    NUM_MGENDERS,
    ONAME_SKIP_INVUPD,
    ONAME_VIA_NAMING,
    PICK_ONE,
    PL_PSIZ,
    PRONOUN_HALLU,
    SUPPRESS_HALLUCINATION,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SUPPRESS_MAPPEARANCE,
    SUPPRESS_NAME,
    SUPPRESS_SADDLE,
    W_SADDLE,
    engulfing_u,
    has_oname,
} from './const.js';
import { artifact_exists, artifact_name, exist_artifact } from './artifacts.js';
import { fruit_from_name } from './fruit.js';
import { game } from './gstate.js';
import { UnsupportedObjectOperationError, carried, objectType } from './obj.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
    s_suffix,
    upstart,
} from './hacklib.js';
import {
    gender,
    is_mplayer,
    pronoun_gender,
    type_is_pname,
} from './mondata.js';
import {
    G_NOGEN,
    G_UNIQ,
    LOW_PM,
    M2_PNAME,
    PM_ALIGNED_CLERIC,
    PM_CLERIC,
    PM_GHOST,
    PM_WIZARD_OF_YENDOR,
    SPECIAL_PM,
} from './monsters.js';
import {
    AMULET_CLASS, AMULET_OF_YENDOR, ARMOR_CLASS, COIN_CLASS,
    CORPSE, FAKE_AMULET_OF_YENDOR, FIGURINE,
    GEM_CLASS, OBJ_DESCR, POTION_CLASS, RING_CLASS, SCROLL_CLASS,
    SPBOOK_CLASS, SPE_NOVEL, STATUE, TOOL_CLASS, VENOM_CLASS, WAND_CLASS,
} from './objects.js';
import { just_an } from './objnam.js';
import { get_rnd_text } from './random_text.js';
import { HLIQUIDS } from './random_text_data.js';
import { rn2, rn2_on_display_rng } from './rng.js';
// display.h canspotmon() (129). js/startup_a11y.js owns it and imports
// capitalizedMonsterName() from this file, so the two modules form a cycle.
// Neither uses the other's binding while its module body evaluates, which is
// what an ES module cycle requires; js/obj.js and this file already form one.
import { canSpotMonster } from './startup_a11y.js';
import { menuTitleStyle } from './tty_menu.js';
import { select_menu } from './windows.js';

const GHOST_NAMES = Object.freeze([
    'Adri',
    'Andries',
    'Andreas',
    'Bert',
    'David',
    'Dirk',
    'Emile',
    'Frans',
    'Fred',
    'Greg',
    'Hether',
    'Jay',
    'John',
    'Jon',
    'Karnov',
    'Kay',
    'Kenny',
    'Kevin',
    'Maud',
    'Michiel',
    'Mike',
    'Peter',
    'Robert',
    'Ron',
    'Tom',
    'Wilmar',
    'Nick Danger',
    'Phoenix',
    'Jiro',
    'Mizue',
    'Stephan',
    'Lance Braccus',
    'Shadowhawk',
    'Murphy',
]);

// C ref: do_name.c new_oname() (60-77). C's two halves are an allocation and a
// deallocation. Only the second survives translation: for a nonzero length C
// frees the old name and allocates a buffer that oname() then copies into,
// which in JavaScript is the assignment alone, so all this half owes is that
// oextra exists to assign into.
export function new_oname(obj, lth) {
    if (lth) {
        /* allocate oextra if necessary; otherwise get rid of old name */
        obj.oextra ??= {};
    } else {
        /* zero length: the new name is empty; get rid of the old name */
        if (has_oname(obj)) free_oname(obj);
    }
}

// C ref: do_name.c free_oname() (80-88). C keeps oextra and clears the name
// field; deleting the property is this port's empty ONAME.
export function free_oname(obj) {
    if (has_oname(obj)) delete obj.oextra.oname;
}

// C ref: do_name.c oname() (371-426). Assigns a player-given or artifact name
// and, when the name belongs to an artifact of this object's type, turns the
// object into that artifact through artifact_exists().
//
// Four arms below the artifact test stop this port. Each needs a caller that
// readobjnam()'s wish -- oname()'s only live caller -- cannot be: the wished
// object is fresh from mksobj(), so it is neither wielded nor secondary-wielded
// nor owned by a shop, and ONAME_WISH carries no ONAME_VIA_NAMING bit. The
// fifth, update_inventory(), needs the object to be in inventory, and a wish
// reaches hold_another_object() only after this returns.
export function oname(obj, name, oflgs, env = {}) {
    const state = env.state ?? game;
    const via_naming = (oflgs & ONAME_VIA_NAMING) !== 0;
    const skip_inv_update = (oflgs & ONAME_SKIP_INVUPD) !== 0;

    // C measures and truncates bytes, so a multi-byte name has to be cut on a
    // byte boundary rather than a code-point one, as christen_monst() does.
    const bytes = encodeUtf8ByteString(String(name));
    let lth = bytes.length ? bytes.length + 1 : 0;
    let text = String(name);
    if (lth > PL_PSIZ) {
        lth = PL_PSIZ;
        text = decodeUtf8ByteString(bytes.slice(0, PL_PSIZ - 1));
    }
    /* If named artifact exists in the game, do not create another.
       Also trying to create an artifact shouldn't de-artifact
       it (e.g. Excalibur from prayer). In this case the object
       will retain its current name. */
    if (obj.oartifact || (lth && exist_artifact(obj.otyp, text, state)))
        return obj;

    new_oname(obj, lth); /* removes old name if one is present */
    if (lth) obj.oextra.oname = text;

    if (lth) artifact_exists(obj, text, true, oflgs, state);
    if (obj.oartifact) {
        /* can't dual-wield with artifact as secondary weapon */
        if (obj === state.uswapwep)
            throw new UnsupportedObjectOperationError('untwoweapon()', obj);
        /* activate warning if you've just named your weapon "Sting" */
        if (obj === state.uwep) {
            throw new UnsupportedObjectOperationError(
                'set_artifact_intrinsic()', obj,
            );
        }
        /* if obj is owned by a shop, increase your bill */
        if (obj.unpaid)
            throw new UnsupportedObjectOperationError('alter_cost()', obj);
        if (via_naming) {
            // do_name.c:414-424 violates illiteracy conduct and writes a
            // livelog event. The conduct counter is saved state, so the arm
            // cannot be skipped the way a livelog-only arm can.
            throw new UnsupportedObjectOperationError(
                'naming-conduct livelog', obj,
            );
        }
    }
    if (carried(obj) && !skip_inv_update) {
        throw new UnsupportedObjectOperationError(
            'update_inventory() after naming', obj,
        );
    }
    return obj;
}

export function christen_monst(monster, name, env = {}) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('christen_monst requires a monster instance');
    const updateInventory = env.updateInventory;
    if (monster.mleashed && typeof updateInventory !== 'function') {
        throw new Error(
            'christen_monst requires update_inventory for a leashed monster',
        );
    }
    const bytes = encodeUtf8ByteString(String(name ?? ''));
    if (!bytes.length) {
        if (monster.mextra) delete monster.mextra.mgivenname;
        if (monster.mleashed) updateInventory(env);
        return monster;
    }
    monster.mextra ??= {};
    monster.mextra.mgivenname = decodeUtf8ByteString(
        bytes.slice(0, PL_PSIZ - 1),
    );
    if (monster.mleashed) updateInventory(env);
    return monster;
}

// An object-naming prompt this port cannot open yet.
// C ref: do_name.c objtyp_is_callable() (429-463). Returns true when the
// object type can be given a type-name by the player.
export function objtyp_is_callable(otyp, state = game) {
    const type = state.objects[otyp];
    if (type.oc_uname) return true;
    switch (type.oc_class) {
    case AMULET_CLASS:
        // Real and fake Amulets of Yendor are excluded to prevent the player
        // from using naming to distinguish them.
        if (otyp === AMULET_OF_YENDOR || otyp === FAKE_AMULET_OF_YENDOR)
            break;
        // fall through
    case SCROLL_CLASS:
    case POTION_CLASS:
    case WAND_CLASS:
    case RING_CLASS:
    case GEM_CLASS:
    case SPBOOK_CLASS:
    case ARMOR_CLASS:
    case TOOL_CLASS:
    case VENOM_CLASS:
        if (OBJ_DESCR(type, state)) return true;
        break;
    default:
        break;
    }
    return false;
}

// C ref: do_name.c name_ok() (466-476). getobj() callback for an object to
// give an individual name. Anything but gold qualifies; artifacts and novels
// are downplayed.
export function name_ok(obj, state = game) {
    if (!obj || obj.oclass === COIN_CLASS) return GETOBJ_EXCLUDE;
    if (!obj.dknown || obj.oartifact || obj.otyp === SPE_NOVEL)
        return GETOBJ_DOWNPLAY;
    return GETOBJ_SUGGEST;
}

// C ref: do_name.c call_ok() (480-495). getobj() callback for naming an
// object's type. The object's type must be callable (have a description or
// already have a user-assigned name).
export function call_ok(obj, state = game) {
    if (!obj || !objtyp_is_callable(obj.otyp, state)) return GETOBJ_EXCLUDE;
    if (!obj.dknown
        || (objectType(obj, state).oc_name_known
            && !state.objects[obj.otyp].oc_uname))
        return GETOBJ_DOWNPLAY;
    return GETOBJ_SUGGEST;
}

export class UnsupportedObjectNamingError extends Error {
    constructor(reason) {
        super(`naming an object type requires ${reason}`);
        this.name = 'UnsupportedObjectNamingError';
        this.reason = reason;
    }
}

// C ref: do_name.c docallcmd() (499-601). The #call / #name command presents
// a "What do you want to name?" menu offering six naming options. When the
// player dismisses the menu without selecting an option (ESC), ch is set to
// 'q' (555), which falls through to case 'q': break (559-562) and returns
// ECMD_OK (600).
//
// The cmdq_pop() / command-queue path (511-518) is not exercised and is left
// as a boundary. The naming options (m, i, o, f, d, a) each dispatch to
// their own handler and are left as boundaries for future slices.
export async function docallcmd(state) {
    /* if player wants a,b,c instead of i,o when looting, do that here too */
    const abc = Boolean(state.flags?.lootabc);

    const items = [
        {
            selector: abc ? undefined : 'm',
            groupSelector: 'C',
            label: 'a monster',
            value: 'm',
        },
    ];
    if (state.invent) {
        items.push(
            {
                selector: abc ? undefined : 'i',
                groupSelector: 'y',
                label: 'a particular object in inventory',
                value: 'i',
            },
            {
                selector: abc ? undefined : 'o',
                groupSelector: 'n',
                label: 'the type of an object in inventory',
                value: 'o',
            },
        );
    }
    items.push(
        {
            selector: abc ? undefined : 'f',
            groupSelector: ',',
            label: 'the type of an object upon the floor',
            value: 'f',
        },
        {
            selector: abc ? undefined : 'd',
            groupSelector: '\\',
            label: 'the type of an object on discoveries list',
            value: 'd',
        },
        {
            selector: abc ? undefined : 'a',
            groupSelector: 'l',
            label: 'record an annotation for the current level',
            value: 'a',
        },
    );

    const choice = await select_menu(state, {
        title: 'What do you want to name?',
        ...menuTitleStyle(state),
        items,
        how: PICK_ONE,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });

    // C: if (select_menu > 0) ch = pick_list[0].item.a_char; else ch = 'q';
    // select_menu returns null on cancel (ESC), mapping to ch = 'q'.
    const ch = choice ?? 'q';
    switch (ch) {
    default:
    case 'q':
        break;
    case 'm': /* name a visible monster */
    case 'i': /* name an individual object in inventory */
    case 'o': /* name a type of object in inventory */
    case 'f': /* name a type of object visible on the floor */
    case 'd': /* name a type of object on the discoveries list */
    case 'a': /* annotate level */
        throw new UnsupportedObjectNamingError(
            `docallcmd() naming option '${ch}'`,
        );
    }
    return ECMD_OK;
}

// C ref: do_name.c docall() (640-676). Everything below its `!obj->dknown`
// guard is one getlin() prompt -- safe_qbuf() builds "Call <thing>:",
// name_from_player() reads the answer, and undiscover_object() or
// discover_object() records it -- and no ported command reaches an input
// boundary here, so the prompt stops.
//
// C's first line is not part of that stop. A hero who cannot see the object
// has nothing to call it by, so docall() returns in silence; the comment there
// reads "probably blind; Blind || Hallucination for 'fromsink'".
export function docall(obj) {
    if (!obj.dknown)
        return; /* probably blind; Blind || Hallucination for 'fromsink' */
    throw new UnsupportedObjectNamingError(
        "getlin()'s \"Call <thing>:\" prompt",
    );
}

// A monster name this port cannot format yet.
export class UnsupportedMonsterNameError extends Error {
    constructor(reason) {
        super(`unsupported monster name: ${reason}`);
        this.name = 'UnsupportedMonsterNameError';
        this.reason = reason;
    }
}

function namingPropertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

// C ref: do_name.c x_monnam()'s do_it predicate (863-865). Six terms, and
// each defeats "it" on its own: the hero can make the monster out; the caller
// asked for "your <pet>"; the game is over and every monster is disclosed; the
// monster is the steed the hero is sitting on; the monster has swallowed the
// hero; or the caller passed SUPPRESS_IT to say it wants a name whatever the
// hero can see.
//
// Both partial spellings of x_monnam() below read it, so it is written once.
// The article is the one in force after x_monnam()'s two adjustments at
// do_name.c:848-859, not the one the caller passed.
function x_monnam_do_it(monster, article, suppress, state) {
    return !canSpotMonster(monster, state)
        && article !== ARTICLE_YOUR
        && !state.program_state?.gameover
        && monster !== state.u?.usteed
        && !engulfing_u(monster, state)
        && !(suppress & SUPPRESS_IT);
}

// C ref: do_name.c x_monnam()'s do_it arm (876-885). augment_it is the one
// thing that makes it answer anything but "it", and no caller here raises it:
// do_name.c some_mon_nam() (1064-1071) and Some_Monnam() (1092-1098) are its
// only sources, and both are unported. Its hallucinating half draws rn2(2),
// so admitting it without a caller would put an unspent call in the port.
function x_monnam_it(suppress) {
    if (suppress & AUGMENT_IT) {
        throw new UnsupportedMonsterNameError(
            "x_monnam()'s AUGMENT_IT arm",
        );
    }
    return 'it';
}

// C ref: do_name.c mon_nam() (1041-1046) over x_monnam(), early
// ordinary-monster subset. `suppress` carries only the flags a wrapper of
// mon_nam() adds: noit_mon_nam() (1053-1060) passes SUPPRESS_IT, which is what
// keeps alwaysVisibleMonsterName() below out of the do_it arm.
//
// A monster the hero cannot spot is named "it" before anything else is
// considered. A given name suppresses the article. An unnamed visible monster
// retains the saddle adjective unless blindness or hallucination prevents
// recognition.
//
// The mask is checked the way x_monnam() below checks its own, so the two
// partial spellings of one C function agree on what an unported flag means.
// Dropping a flag silently would answer a name C does not: a port of
// noname_monnam() (1104-1107) passing SUPPRESS_NAME would get "Fido" from the
// given-name line below, where do_name.c:872 computes do_name and answers
// "the dog".
const MONSTER_COMMON_NAME_FLAGS = SUPPRESS_IT | AUGMENT_IT;

export function monsterCommonName(
    monster,
    state = game,
    suppress = 0,
    env = {},
) {
    if (suppress & ~MONSTER_COMMON_NAME_FLAGS) {
        throw new UnsupportedMonsterNameError(
            `mon_nam() suppress flags 0x${suppress.toString(16)}`,
        );
    }
    // mon_nam() always passes ARTICLE_THE, so the article term is constantly
    // true here and SUPPRESS_IT is the only term a wrapper can move.
    if (x_monnam_do_it(monster, ARTICLE_THE, suppress, state))
        return x_monnam_it(suppress);
    const hallucinating = namingPropertyActive(state, HALLUC)
        && !namingPropertyActive(state, HALLUC_RES);
    if (hallucinating) {
        // do_name.c:950-955. mon_nam() does not suppress hallucination, so
        // the species is replaced after the "it" decision and before given
        // names or saddle adjectives are considered. rndmonnam() consumes
        // the display RNG, not the gameplay RNG.
        return `the ${rndmonnam({
            state,
            random: env.displayRandom ?? rn2_on_display_rng,
        })}`;
    }
    // do_name.c:911 `pm_name = mon_pmname(mtmp)`, which picks the species
    // name by the monster's own gender and falls back to the neutral slot only
    // when that one is empty. Reading the neutral slot directly named a male
    // gnome king a "gnome ruler".
    const speciesName = mon_pmname(monster) ?? 'monster';
    const givenName = monster.mextra?.mgivenname
        || monster.mgivenname
        || monster.name;
    if (givenName) return givenName;
    const blind = namingPropertyActive(state, BLINDED)
        || Boolean(state.u?.uroleplay?.blind);
    const saddled = !blind && !hallucinating
        && Boolean(monster.misc_worn_check & W_SADDLE);
    return `the ${saddled ? 'saddled ' : ''}${speciesName}`;
}

export function capitalizedMonsterName(monster, state = game) {
    const name = monsterCommonName(monster, state);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: do_name.c pmname() (1300-1308).
//
// The two range tests are carried because C indexes pmnames[] directly and
// would read out of bounds without them. In JavaScript they change no answer:
// an out-of-range index reads undefined, which the third disjunct already
// rejects, so mutating either one leaves every result identical.
export function pmname(species, mgender) {
    let index = mgender;
    if (index < MALE || index >= NUM_MGENDERS || !species.pmnames[index])
        index = NEUTRAL;
    return species.pmnames[index];
}

// C ref: do_name.c mon_pmname() (1311-1317).
export function mon_pmname(monster) {
    return pmname(monster.data, gender(monster));
}

// C ref: do_name.c obj_pmname() (1321-1358). Corpses, statues, and figurines
// store their selected gender in the low two bits of obj->spe. A random-gender
// aligned cleric deliberately uses the role monster's neutral "cleric" name
// rather than the monster priest's "aligned cleric" name.
export function obj_pmname(obj, state = game) {
    if ([CORPSE, STATUE, FIGURINE].includes(obj.otyp)
        && ismnum(obj.corpsenm)) {
        const cgend = obj.spe & CORPSTAT_GENDER;
        const mgend = cgend === CORPSTAT_MALE ? MALE
            : cgend === CORPSTAT_FEMALE ? FEMALE : NEUTRAL;
        let mndx = obj.corpsenm;

        if (mndx === PM_ALIGNED_CLERIC && cgend === CORPSTAT_RANDOM)
            mndx = PM_CLERIC;

        return pmname(state.mons[mndx], mgend);
    }
    // C reports impossible() and returns this sentinel. Keeping the return
    // makes the helper total without adding output or mutation to this pure
    // port; valid callers never reach it.
    return 'two-legged glorkum-seeker';
}

// C ref: do_name.c x_monnam() (826-1032), restricted to the `suppress`
// combinations that carry SUPPRESS_INVISIBLE. Three callers are ported:
// steed.c mount_steed(), which builds the killer string for a slipped mount
// ("a saddled pony", or "a saddled pony called Dobbin"); and apply.c
// use_stethoscope():392 and insight.c mstatusline():3392, which name the
// monster a stethoscope was pointed at. All three pass SUPPRESS_IT as well.
//
// SUPPRESS_INVISIBLE is what makes the do_invis branch statically dead here.
// SUPPRESS_HALLUCINATION is not required, because the two stethoscope callers
// do not pass it; instead do_hallu is computed as C computes it, and a
// hallucinating hero stops. That branch replaces the whole name with
// rndmonnam(), which draws from the display RNG once per rejected species and
// once more for the gender, so admitting it without a differential that
// measures those draws would put unspent calls in the port.
//
// monsterCommonName() and capitalizedMonsterName() above are the port's
// mon_nam() and Monnam() subset; they answer ARTICLE_THE and now share the
// hallucination name branch with this function.
export function x_monnam(
    monster,
    article,
    adjective,
    suppress,
    called,
    state = game,
) {
    if (!(suppress & SUPPRESS_INVISIBLE)) {
        throw new UnsupportedMonsterNameError(
            `x_monnam() suppress flags 0x${suppress.toString(16)}`,
        );
    }
    const mdat = monster.data;

    let effectiveSuppress = suppress;
    // do_name.c:845-846. Disclosure names every monster truly, so the game
    // being over suppresses hallucination however the caller asked.
    if (state.program_state?.gameover)
        effectiveSuppress |= SUPPRESS_HALLUCINATION;

    // do_invis is FALSE under the required flag above, so the hallucinated
    // bogus name is the only one of the two branches that can be reached.
    let effectiveArticle = article;
    if (effectiveArticle === ARTICLE_YOUR && !monster.mtame)
        effectiveArticle = ARTICLE_THE;
    if (state.u?.uswallow && monster === state.u.ustuck)
        effectiveArticle = ARTICLE_THE;

    // do_name.c:861. C computes do_hallu here and reads it at :917 for a
    // shopkeeper and at :950 for the name itself; both are unreachable in this
    // port -- the shopkeeper stops below whatever the hero sees -- so the one
    // stop stands for the whole branch.
    if (namingPropertyActive(state, HALLUC)
        && !namingPropertyActive(state, HALLUC_RES)
        && !(effectiveSuppress & SUPPRESS_HALLUCINATION)) {
        throw new UnsupportedMonsterNameError(
            "x_monnam()'s rndmonnam() branch",
        );
    }

    // do_name.c:876-885, above the priest and minion block C reaches next.
    if (x_monnam_do_it(monster, effectiveArticle, effectiveSuppress, state))
        return x_monnam_it(effectiveSuppress);

    const do_saddle = !(effectiveSuppress & SUPPRESS_SADDLE);
    const do_mappear = ((monster.m_ap_type ?? 0) & M_AP_TYPMASK)
        === M_AP_MONSTER && !(effectiveSuppress & SUPPRESS_MAPPEARANCE);
    const do_name = !(effectiveSuppress & SUPPRESS_NAME)
        || type_is_pname(mdat);

    if (((monster.ispriest || monster.isminion || monster.isshk)
            && !do_mappear)
        || is_mplayer(mdat)) {
        throw new UnsupportedMonsterNameError(
            'x_monnam() for a priest, minion, shopkeeper, or player monster',
        );
    }

    // do_name.c:907-910. A monster-shaped appearance replaces only the base
    // species name. The given-name and article decisions below continue to
    // read the real monster species, which produces C's deliberately odd
    // article when the apparent species has a personal name.
    const pm_name = do_mappear
        ? pmname(state.mons[monster.mappearance], gender(monster))
        : mon_pmname(monster);
    let buf = '';

    if (adjective) buf += `${adjective} `;
    // do_invis is FALSE, so the "invisible " adjective cannot be added.
    if (do_saddle && (monster.misc_worn_check & W_SADDLE)
        && !namingPropertyActive(state, BLINDED)
        && !(namingPropertyActive(state, HALLUC)
            && !namingPropertyActive(state, HALLUC_RES)))
        buf += 'saddled ';
    const has_adjectives = buf !== '';

    let name_at_start;
    const givenName = monster.mextra?.mgivenname;
    if (do_name && givenName) {
        if (mdat === state.mons?.[PM_GHOST]) {
            throw new UnsupportedMonsterNameError(
                "x_monnam() for a named ghost's s_suffix() form",
            );
        } else if (called) {
            buf += `${pm_name} called ${givenName}`;
            name_at_start = type_is_pname(mdat);
        } else {
            // The is_mplayer() " the " arm above this one is refused already.
            buf += givenName;
            name_at_start = true;
        }
    } else {
        buf += pm_name;
        name_at_start = type_is_pname(mdat);
    }

    if (name_at_start
        && (effectiveArticle === ARTICLE_YOUR || !has_adjectives)) {
        effectiveArticle = mdat === state.mons?.[PM_WIZARD_OF_YENDOR]
            ? ARTICLE_THE : ARTICLE_NONE;
    } else if ((mdat.geno & G_UNIQ) !== 0 && effectiveArticle === ARTICLE_A) {
        effectiveArticle = ARTICLE_THE;
    }

    switch (effectiveArticle) {
    case ARTICLE_YOUR: return `your ${buf}`;
    case ARTICLE_THE: return `the ${buf}`;
    case ARTICLE_A: return `${just_an(buf)}${buf}`;
    case ARTICLE_NONE:
    default: return buf;
    }
}

// C ref: do_name.c noit_Monnam() (1082-1089) over noit_mon_nam()
// (1053-1060). ARTICLE_YOUR becomes "your" for an unnamed tame monster and
// "the" otherwise; a given name has no article.
//
// noit_mon_nam() passes x_monnam() SUPPRESS_IT, and SUPPRESS_SADDLE as well
// for a named monster. SUPPRESS_HALLUCINATION is not among them, so
// do_name.c:861 raises do_hallu for a hallucinating hero and :950-955 replaces
// the whole name with rndmonnam(), which draws rn2_on_display_rng() once per
// rejected species and once more for the gender (do_name.c:1399-1407).
// monsterCommonName() below has no bogus-name arm and draws nothing, so this
// stops rather than printing the true species name and skipping the draws.
//
// SUPPRESS_IT is passed on to monsterCommonName(). That is the whole point of
// this wrapper -- C's comment at 1049-1052 says it names a monster "as if the
// player can always see" it -- and without it a hero who cannot spot her own
// pet would be told "It moves reluctantly." where C names the pet.
export function alwaysVisibleMonsterName(
    monster,
    state = game,
) {
    // youprop.h:116-120 Hallucination: the intrinsic timeout alone, defeated
    // by either half of Halluc_resistance.
    const resistance = state.u?.uprops?.[HALLUC_RES];
    if (state.u?.uprops?.[HALLUC]?.intrinsic
        && !(resistance?.intrinsic || resistance?.extrinsic)) {
        throw new UnsupportedMonsterNameError(
            "noit_Monnam()'s hallucinated bogus name",
        );
    }
    let name = monsterCommonName(monster, state, SUPPRESS_IT);
    if (monster.mtame
        && !monster.mextra?.mgivenname
        && !monster.mgivenname
        && !monster.name
        && name.startsWith('the ')) {
        name = `your ${name.slice(4)}`;
    }
    return name;
}

export function capitalizedAlwaysVisibleMonsterName(
    monster,
    state = game,
) {
    const name = alwaysVisibleMonsterName(monster, state);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: do_name.c mon_nam_too() (1189-1216). The object of a verb whose
// subject is `other_mon`: an ordinary name when the two differ, and a
// reflexive pronoun when they are the same monster.
//
// C's `case 2` shares its body with `default`, so any row of role.c genders[]
// other than male, female and "they" reads as neuter. pronoun_gender() spends
// an rn2(4) for a hallucinating hero and needs canspotmon() otherwise, so the
// caller's env is forwarded whole.
export function mon_nam_too(mon, other_mon, state = game, env = {}) {
    if (mon !== other_mon) return monsterCommonName(mon, state);
    switch (pronoun_gender(mon, PRONOUN_HALLU, { ...env, state })) {
    case 0: return 'himself';
    case 1: return 'herself';
    case 3: /* "could happen when hallucinating" */
        return 'themselves';
    default:
    case 2: return 'itself';
    }
}

// C ref: hacklib.c s_suffix() over mon_nam()/Monnam(), which is how mhitm.c
// hitmm() spells the AT_TENT line at 687-690. The suffix comes from the ported
// function rather than from an apostrophe rule written here, because
// s_suffix() special-cases "it" and "you" case-blind: C answers "Its
// tentacles suck", and a bare apostrophe rule answers "It's".
export function monsterPossessive(monster, state = game, capitalized = false) {
    const name = capitalized
        ? capitalizedMonsterName(monster, state)
        : monsterCommonName(monster, state);
    return s_suffix(name);
}

export function rndghostname(env = {}) {
    const random = env.random ?? { rn2 };
    const state = env.state ?? game;
    if (typeof random.rn2 !== 'function')
        throw new TypeError('rndghostname random injection requires rn2');
    return random.rn2(7)
        ? GHOST_NAMES[random.rn2(GHOST_NAMES.length)]
        : String(state.plname ?? '');
}

function displayRandomFunction(random) {
    if (typeof random === 'function') return random;
    if (random && typeof random.rn2 === 'function')
        return (bound) => random.rn2(bound);
    throw new TypeError('display random injection requires rn2');
}

// C ref: do_name.c bogusmon(). Prefix codes affect capitalization and
// personal-name handling; Amonnam() uses the code when it selects the article,
// while glyph-update descriptions only need the stripped text.
export function bogusmon(env = {}) {
    const random = displayRandomFunction(
        env.random ?? rn2_on_display_rng,
    );
    const selected = get_rnd_text(
        BOGUSMONFILE,
        random,
        MD_PAD_BOGONS,
        env,
    );
    if (!selected) return { name: 'bogon', code: '' };
    const code = '-_+|='.includes(selected[0]) ? selected[0] : '';
    return {
        name: code ? selected.slice(1) : selected,
        code,
    };
}

// C ref: do_name.c bogon_is_pname() (1415-1421).
export function bogon_is_pname(code) {
    return Boolean(code && '-+='.includes(code));
}

// C ref: do_name.c rndmonnam(). Candidate selection shares the display RNG
// with monster glyph randomization and may retry excluded species. An ordinary
// monster then draws its gender; a bogus name instead uses get_rnd_text()'s
// byte-offset selection, which may retry when it lands in a long record.
function rndmonnamDetails(env = {}) {
    const state = env.state ?? game;
    const random = displayRandomFunction(
        env.random ?? rn2_on_display_rng,
    );
    let index;
    do {
        index = random(SPECIAL_PM + 100 - LOW_PM) + LOW_PM;
    } while (index < SPECIAL_PM
        && ((state.mons?.[index]?.mflags2 & M2_PNAME)
            || (state.mons?.[index]?.geno & G_NOGEN)));

    if (index >= SPECIAL_PM)
        return bogusmon({ ...env, random });

    const species = state.mons?.[index];
    if (!species)
        throw new Error('rndmonnam requires the complete monster catalog');
    const gender = random(2);
    return {
        name: species.pmnames?.[gender]
            ?? species.pmnames?.[2]
            ?? 'monster',
        code: '',
    };
}

export function rndmonnam(env = {}) {
    return rndmonnamDetails(env).name;
}

// True where a_monnam() below cannot format the monster, so that a caller can
// decide before any naming side effect -- a hallucinating hero's a_monnam()
// draws from the display RNG -- whether it is about to reach an unported arm.
// This is the only refusal a_monnam() makes: the titled monsters whose naming
// arms are unported, and an M_AP_MONSTER appearance that names no species in
// the catalogue, which x_monnam() would read past the end of mons[].
export function a_monnam_unsupported(monster, state = game) {
    return Boolean(monster.ispriest || monster.isminion || monster.isshk
        || is_mplayer(monster.data)
        || !apparent_species(monster, state));
}

// The species x_monnam() (do_name.c:908-910) names for a monster: what it
// mimics when it is disguised as one, otherwise its own.
function apparent_species(monster, state) {
    const appearance = (monster.m_ap_type ?? 0) & M_AP_TYPMASK;
    return appearance === M_AP_MONSTER
        ? state.mons?.[monster.mappearance]
        : monster.data;
}

// C ref: do_name.c x_monnam() and a_monnam() (1152-1156).  This is the
// ordinary, already-spotted monster path used by makemon.c's runtime creation
// message and by hack.c moverock_core()'s monster-behind-the-boulder arm.
// Priests, shopkeepers, player monsters, and the unseen "it" arm retain their
// separate owners and fail closed here.
export function a_monnam(monster, env = {}) {
    const state = env.state ?? game;
    if (a_monnam_unsupported(monster, state)) {
        throw new UnsupportedMonsterNameError(
            'a_monnam() for a priest, minion, shopkeeper, player monster, '
                + 'or invalid monster appearance',
        );
    }

    const hallucinating = namingPropertyActive(state, HALLUC)
        && !namingPropertyActive(state, HALLUC_RES);
    const blind = namingPropertyActive(state, BLINDED)
        || Boolean(state.u?.uroleplay?.blind);
    let text = '';
    if (monster.minvis) text += 'invisible ';
    if ((monster.misc_worn_check & W_SADDLE) && !blind && !hallucinating)
        text += 'saddled ';
    const hasAdjectives = text !== '';

    let nameAtStart = false;
    if (hallucinating) {
        const randomName = rndmonnamDetails({
            state,
            random: env.displayRandom ?? rn2_on_display_rng,
        });
        text += randomName.name;
        nameAtStart = bogon_is_pname(randomName.code);
    } else {
        const mdat = monster.data;
        const species = apparent_species(monster, state);
        const givenName = monster.mextra?.mgivenname;
        if (givenName) {
            // do_name.c changes pm_name for M_AP_MONSTER, but every decision
            // about the monster's own name continues to use real mdat.
            text += mdat === state.mons?.[PM_GHOST]
                ? `${s_suffix(givenName)} ghost` : givenName;
            nameAtStart = true;
        } else {
            text += pmname(species, gender(monster));
            nameAtStart = type_is_pname(mdat);
        }
    }

    let article = ARTICLE_A;
    if (nameAtStart && !hasAdjectives) article = ARTICLE_NONE;
    else if ((monster.data.geno & G_UNIQ) !== 0) article = ARTICLE_THE;
    return article === ARTICLE_A ? `${just_an(text)}${text}`
        : article === ARTICLE_THE ? `the ${text}` : text;
}

// C ref: do_name.c Amonnam() (1158-1165), a_monnam() with its first letter
// raised by highc().
export function Amonnam(monster, env = {}) {
    return upstart(a_monnam(monster, env));
}

// C ref: do_name.c hliquid().  Hallucinatory terrain descriptions share the
// display RNG with glyph randomization and monster naming.
export function hliquid(liquidpref, env = {}) {
    const state = env.state ?? game;
    const random = displayRandomFunction(
        env.random ?? rn2_on_display_rng,
    );
    const preferred = liquidpref == null ? '' : String(liquidpref);
    const hallucinating = Boolean(
        state.u?.uprops?.[HALLUC]?.intrinsic,
    ) && !Boolean(
        state.u?.uprops?.[HALLUC_RES]?.intrinsic
            || state.u?.uprops?.[HALLUC_RES]?.extrinsic,
    ) && !state.program_state?.gameover;
    if (hallucinating || !preferred) {
        const count = HLIQUIDS.length + (preferred ? 1 : 0);
        const index = random(count);
        if (index < HLIQUIDS.length) return HLIQUIDS[index];
    }
    return preferred;
}

export const SIR_TERRY_NOVELS = Object.freeze([
    'The Colour of Magic',
    'The Light Fantastic',
    'Equal Rites',
    'Mort',
    'Sourcery',
    'Wyrd Sisters',
    'Pyramids',
    'Guards! Guards!',
    'Eric',
    'Moving Pictures',
    'Reaper Man',
    'Witches Abroad',
    'Small Gods',
    'Lords and Ladies',
    'Men at Arms',
    'Soul Music',
    'Interesting Times',
    'Maskerade',
    'Feet of Clay',
    'Hogfather',
    'Jingo',
    'The Last Continent',
    'Carpe Jugulum',
    'The Fifth Elephant',
    'The Truth',
    'Thief of Time',
    'The Last Hero',
    'The Amazing Maurice and His Educated Rodents',
    'Night Watch',
    'The Wee Free Men',
    'Monstrous Regiment',
    'A Hat Full of Sky',
    'Going Postal',
    'Thud!',
    'Wintersmith',
    'Making Money',
    'Unseen Academicals',
    'I Shall Wear Midnight',
    'Snuff',
    'Raising Steam',
    "The Shepherd's Crown",
]);

// The source always consumes its draw before inspecting an existing index.
// Return the potentially updated union value alongside the chosen title so a
// caller cannot accidentally skip that distinction.
export function noveltitle(novelidx = undefined, env = {}) {
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('noveltitle random injection requires rn2');
    let selected = random.rn2(SIR_TERRY_NOVELS.length);
    let stored = novelidx;
    if (novelidx === -1) {
        stored = selected;
    } else if (Number.isInteger(novelidx)
               && novelidx >= 0
               && novelidx < SIR_TERRY_NOVELS.length) {
        selected = novelidx;
    }
    return { novelidx: stored, title: SIR_TERRY_NOVELS[selected] };
}

function asciiFold(value) {
    return String(value).replace(
        /[A-Z]/gu,
        (character) => String.fromCharCode(character.charCodeAt(0) + 32),
    );
}

function sameTitle(left, right) {
    return asciiFold(left) === asciiFold(right);
}

function startsWithThe(title) {
    return sameTitle(String(title).slice(0, 4), 'the ');
}

function fruitNameForcesArticle(title, state) {
    if (!state.gf?.ffruit) return false;
    if (!fruit_from_name(title, true, state)) return false;
    const artifactName = artifact_name(title, null, false, state);
    return !artifactName || startsWithThe(artifactName);
}

// Lookup-specific port of the objnam.c the()/The() decisions which can affect
// the fixed novel catalog.  Proper title casing normally suppresses “the,”
// while a configured fruit name can force it back unless an artifact with the
// same name deliberately lacks the article.
function withDefiniteArticle(title, state) {
    const text = String(title);
    if (startsWithThe(text)) return `T${text.slice(1)}`;

    let insertThe = !/^[A-Z]/u.test(text)
        || fruitNameForcesArticle(text, state);
    if (!insertThe) {
        const lastSpace = text.lastIndexOf(' ');
        const separator = lastSpace >= 0
            ? lastSpace
            : text.lastIndexOf('-');
        if (separator >= 0 && !/^[A-Z]/u.test(text.slice(separator + 1))) {
            insertThe = !text.includes("'");
        } else if (separator >= 0 && text.indexOf(' ') < separator) {
            const folded = asciiFold(text);
            const ofIndex = folded.indexOf(' of ');
            const namedIndex = folded.indexOf(' named ');
            const calledIndex = folded.indexOf(' called ');
            const namingIndex = namedIndex < 0
                ? calledIndex
                : calledIndex < 0
                    ? namedIndex
                    : Math.min(namedIndex, calledIndex);
            insertThe = ofIndex >= 0
                && (namingIndex < 0 || ofIndex < namingIndex);
        }
    }
    const result = insertThe ? `the ${text}` : text;
    return result ? result[0].toUpperCase() + result.slice(1) : result;
}

// C ref: do_name.c lookup_novel(). Preserve an already valid generated index
// when the supplied title is unknown; sp_lev.c uses only the updated index and
// leaves the explicitly supplied object name intact.
export function lookup_novel(lookname, novelidx = undefined, env = {}) {
    const state = env.state ?? game;
    let sought = String(lookname);
    if (sameTitle(
        withDefiniteArticle(sought, state),
        'The Color of Magic',
    )) {
        sought = SIR_TERRY_NOVELS[0];
    } else if (sameTitle(sought, 'Sorcery')) {
        sought = SIR_TERRY_NOVELS[4];
    } else if (sameTitle(sought, 'Masquerade')) {
        sought = SIR_TERRY_NOVELS[17];
    } else if (sameTitle(
        withDefiniteArticle(sought, state),
        'The Amazing Maurice',
    )) {
        sought = SIR_TERRY_NOVELS[27];
    } else if (sameTitle(sought, 'Thud')) {
        sought = SIR_TERRY_NOVELS[33];
    }

    const matchedIndex = SIR_TERRY_NOVELS.findIndex(
        (title) => sameTitle(sought, title)
            || sameTitle(withDefiniteArticle(sought, state), title),
    );
    if (matchedIndex >= 0) {
        return {
            novelidx: matchedIndex,
            title: SIR_TERRY_NOVELS[matchedIndex],
        };
    }
    if (Number.isInteger(novelidx)
        && novelidx >= 0
        && novelidx < SIR_TERRY_NOVELS.length) {
        return { novelidx, title: SIR_TERRY_NOVELS[novelidx] };
    }
    return { novelidx, title: null };
}
