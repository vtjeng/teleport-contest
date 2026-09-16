// Monster names, naming commands, and novel-title data.
// C ref: src/do_name.c docallcmd(), christen_monst(), docall(),
// rndghostname(), rndorcname(), christen_orc(), bogusmon(), rndmonnam(),
// sir_Terry_novels[], noveltitle(), and lookup_novel().

import {
    A_CHA,
    ARTICLE_A,
    ARTICLE_NONE,
    ARTICLE_THE,
    ARTICLE_YOUR,
    AUGMENT_IT,
    BOGUSMONFILE,
    BUFSZ,
    CMDQ_KEY,
    CQ_CANNED,
    CORPSTAT_FEMALE,
    CORPSTAT_GENDER,
    CORPSTAT_MALE,
    CORPSTAT_RANDOM,
    ECMD_OK,
    EXACT_NAME,
    GETOBJ_NOFLAGS,
    GETOBJ_PROMPT,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_SUGGEST,
    FEMALE,
    HALLUC,
    HALLUC_RES,
    HAND,
    INFRAVISION,
    LL_ARTIFACT,
    LL_CONDUCT,
    ismnum,
    MALE,
    MD_PAD_BOGONS,
    M_AP_MONSTER,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPE,
    M_AP_TYPMASK,
    MS_ANIMAL,
    NEUTRAL,
    NUM_MGENDERS,
    ONAME_KNOW_ARTI,
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
    NON_PM,
    OBJ_FREE,
    OBJ_INVENT,
    W_SADDLE,
    Upolyd,
    engulfing_u,
    has_ebones,
    has_mgivenname,
    has_oname,
    helpless,
    isok,
    u_at,
    SEE_INVIS,
    DEAF,
} from './const.js';
import {
    artifact_exists,
    artifact_name,
    exist_artifact,
    restrict_name,
} from './artifacts.js';
import {
    flush_screen,
    glyph_at,
    glyph_is_object,
    glyph_is_swallow,
    rank_of,
    vobj_at,
} from './display.js';
import { getpos } from './getpos.js';
import { body_part, poly_gender } from './polyself.js';
import { cansee, couldsee } from './vision.js';
import { priestname } from './priest.js';
import { shkname } from './shknam.js';
import { alter_cost } from './shk.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
    fuzzymatch,
    mungspaces,
    s_suffix,
    strstri,
    upstart,
} from './hacklib.js';
import { carrying, getobj, update_inventory } from './invent.js';
import {
    humanoid,
    is_animal,
    is_mplayer,
    is_rider,
    mhe,
    mhis,
    mindless,
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
    PM_HIGH_CLERIC,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_JUIBLEX,
    PM_SHOPKEEPER,
    PM_WIZARD_OF_YENDOR,
    NUMMONS,
    SPECIAL_PM,
} from './monsters.js';
import { carried, dealloc_obj, objectType } from './obj.js';
import {
    discover_object,
    undiscover_object,
} from './o_init.js';
import {
    AMULET_CLASS, AMULET_OF_YENDOR, ARMOR_CLASS, COIN_CLASS,
    CORPSE, FAKE_AMULET_OF_YENDOR, FIGURINE, FOOD_CLASS,
    GEM_CLASS, HEAVY_IRON_BALL, OBJ_DESCR, POTION_CLASS,
    RING_CLASS, SCROLL_CLASS, STRANGE_OBJECT,
    SPBOOK_CLASS, SPE_NOVEL, STATUE, TIN, TOOL_CLASS, TOWEL,
    VENOM_CLASS, WAND_CLASS, WEAPON_CLASS,
} from './objects.js';
import {
    an, ansimpleoname, bare_artifactname, is_plural, just_an, safe_qbuf,
    simpleonames, The, vtense,
    xnameFresh, Ysimple_name2,
} from './objnam.js';
import { get_rnd_text } from './random_text.js';
import { HCOLORS, HLIQUIDS } from './random_text_data.js';
import { rn1, rn2, rn2_on_display_rng, rnd_on_display_rng } from './rng.js';
import { getlin } from './windows.js';
import { note_unported } from './unported.js';
import { displayPendingTtyMessageWindow, ttyPline } from './tty_message.js';
import { livelog_printf, verbalize } from './pline.js';
import { wipeout_text } from './engrave.js';
import { acurr } from './attrib.js';
import { hides_under } from './mondata.js';
// display.h canspotmon() (129). js/startup_a11y.js owns it and imports
// capitalizedMonsterName() from this file, so the two modules form a cycle.
// Neither uses the other's binding while its module body evaluates, which is
// what an ES module cycle requires; js/obj.js and this file already form one.
import { canSpotMonster, heroIsBlind, sensesMonster } from './startup_a11y.js';
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

// C ref: do_name.c nextmbuf() (20-27), new_mgivenname() (31-47), and
// free_mgivenname() (51-57). Strings supply the storage C gets from alloc().
const NEXT_MBUF = Array.from({ length: 5 }, () => '');
let nextMbufIndex = 0;

export function nextmbuf() {
    nextMbufIndex = (nextMbufIndex + 1) % NEXT_MBUF.length;
    return NEXT_MBUF[nextMbufIndex];
}

export function new_mgivenname(mon, lth) {
    if (lth) {
        mon.mextra ??= {};
        free_mgivenname(mon);
    } else if (has_mgivenname(mon)) {
        free_mgivenname(mon);
    }
}

export function free_mgivenname(mon) {
    if (has_mgivenname(mon)) {
        if (mon.mextra) delete mon.mextra.mgivenname;
        delete mon.mgivenname;
    }
}

// C ref: do_name.c new_oname() (60-77). C retains oextra and releases a prior
// string before assigning the replacement.
export function new_oname(obj, lth) {
    if (lth) {
        obj.oextra ??= {};
        free_oname(obj);
    } else {
        if (has_oname(obj)) free_oname(obj);
    }
}

// C ref: do_name.c free_oname() (80-88). C keeps oextra and clears ONAME.
export function free_oname(obj) {
    if (has_oname(obj)) {
        if (obj.oextra) delete obj.oextra.oname;
        delete obj.oname;
    }
}

// C ref: do_name.c safe_oname() (95-100).
export function safe_oname(obj) {
    return obj?.oextra?.oname ?? obj?.oname ?? '';
}

// C ref: do_name.c oname() (371-426). Assigns a player-given or artifact name
// and, when the name belongs to an artifact of this object's type, turns the
// object into that artifact through artifact_exists(). Unported side effects
// retain their source order through note_unported() while gameplay state that
// the JavaScript port owns is updated here.
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
        if (obj === state.uswapwep) {
            state.u.twoweap = false;
            note_unported('wield.c untwoweapon() message');
        }
        /* activate warning if you've just named your weapon "Sting" */
        if (obj === state.uwep)
            note_unported('artifact.c set_artifact_intrinsic()');
        /* if obj is owned by a shop, increase your bill */
        if (obj.unpaid)
            alter_cost(obj, 0, state);
        if (via_naming) {
            state.u.uconduct ??= {};
            const firstNaming = !(state.u.uconduct.literate ?? 0);
            state.u.uconduct.literate = Math.trunc(
                state.u.uconduct.literate ?? 0,
            ) + 1;
            if (firstNaming) {
                livelog_printf(
                    LL_CONDUCT | LL_ARTIFACT,
                    `became literate by naming ${bare_artifactname(obj, state)}`,
                    state,
                );
            } else {
                livelog_printf(
                    LL_ARTIFACT,
                    `chose ${ansimpleoname(obj, state)} to be named "${bare_artifactname(obj, state)}"`,
                    state,
                );
            }
        }
    }
    if (carried(obj) && !skip_inv_update)
        update_inventory({ state });
    return obj;
}

export function christen_monst(monster, name, env = {}) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('christen_monst requires a monster instance');
    const bytes = encodeUtf8ByteString(String(name ?? ''));
    const lth = bytes.length ? bytes.length + 1 : 0;
    const clipped = lth > PL_PSIZ
        ? decodeUtf8ByteString(bytes.slice(0, PL_PSIZ - 1))
        : String(name ?? '');
    new_mgivenname(monster, lth > PL_PSIZ ? PL_PSIZ : lth);
    if (lth) {
        monster.mextra ??= {};
        monster.mextra.mgivenname = clipped;
    }
    if (monster.mleashed) {
        if (typeof env.updateInventory === 'function') env.updateInventory(env);
        else update_inventory({ state: env.state ?? game });
    }
    return monster;
}

// C ref: do_name.c roguename() (1424-1436). ROGUEOPTS is a process
// environment setting in C; the port exposes it through state.environment for
// deterministic callers and otherwise follows the three-name random choice.
export function roguename(state = game, random = rn2) {
    const opts = state.environment?.ROGUEOPTS ?? state.ROGUEOPTS;
    if (opts != null) {
        // C scans every position in ROUGEOPTS, rather than requiring an
        // option delimiter before name=.
        const text = String(opts);
        const start = text.indexOf('name=');
        if (start >= 0) {
            const end = text.indexOf(',', start + 5);
            return text.slice(start + 5, end < 0 ? text.length : end);
        }
    }
    return random(3) ? (random(2) ? 'Michael Toy' : 'Kenneth Arnold')
        : 'Glenn Wichman';
}

// C ref: do_name.c rndorcname() (1537-1554).  Orc names alternate vowel and
// consonant chunks, starting on either side, and very rarely hyphenate a
// chunk after the first.  Keeping this here lets mkmaze.c's stolen_booty()
// consume the same draws as the source without embedding naming policy in the
// maze generator.
export function rndorcname(random = { rn1, rn2 }) {
    const vowels = ['a', 'ai', 'og', 'u'];
    const sounds = ['gor', 'gris', 'un', 'bane', 'ruk', 'oth', 'ul', 'z',
        'thos', 'akh', 'hai'];
    const end = random.rn1(2, 3);
    let vowelNext = random.rn2(2);
    let result = '';
    for (let i = 0; i < end; ++i) {
        vowelNext = 1 - vowelNext;
        const choices = vowelNext ? vowels : sounds;
        // The patched C build evaluates the second Sprintf argument before
        // the first.  Select the chunk before consuming the hyphen draw, then
        // append them in the source's rendered order.
        const chunk = choices[random.rn2(choices.length)];
        if (i > 0 && !random.rn2(30)) result += '-';
        result += chunk;
    }
    return result;
}

// C ref: do_name.c christen_orc() (1556-1585).  The generated personal name
// is capitalized and optionally followed by the invading gang name.
export function christen_orc(monster, gang, other, env = {}) {
    const orcname = rndorcname(env.random ?? { rn1, rn2 });
    let size = encodeUtf8ByteString(orcname).length;
    // C tests pointers for presence, so an empty gang or suffix still names
    // the monster and takes the corresponding branch.
    if (gang !== null && gang !== undefined)
        size += encodeUtf8ByteString(String(gang)).length + ' of '.length;
    else if (other !== null && other !== undefined)
        size += encodeUtf8ByteString(String(other)).length;

    if (size < BUFSZ) {
        let name;
        if (gang !== null && gang !== undefined) {
            name = `${upstart(orcname)} of ${upstart(String(gang))}`;
        } else if (other !== null && other !== undefined) {
            name = `${upstart(orcname)}${String(other)}`;
        }
        if (name !== undefined)
            return christen_monst(monster, name, env);
    }
    return monster;
}

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

// C ref: do_name.c alreadynamed() (158-195). This is async only because the
// JavaScript terminal's pline() waits at a message boundary.
export async function alreadynamed(monster, monnambuf, usrbuf, state = game) {
    if (!usrbuf) {
        const nameNotTitle = has_mgivenname(monster)
            || type_is_pname(monster.data)
            || monster.isshk;
        await ttyPline(
            `${upstart(monnambuf)} would rather keep `
            + `${is_rider(monster.data) ? 'its' : mhis(monster, { state })} `
            + `existing ${nameNotTitle ? 'name' : 'title'}.`,
            state,
        );
        return true;
    }

    let match = fuzzymatch(usrbuf, monnambuf, ' -_', true);
    const invisibleName = strstri(monnambuf, 'invisible ');
    const ofName = strstri(monnambuf, ' of ');
    if (!match && monnambuf.toLowerCase().startsWith('the '))
        match = fuzzymatch(usrbuf, monnambuf.slice(4), ' -_', true);
    if (!match && invisibleName >= 0)
        match = fuzzymatch(usrbuf, monnambuf.slice(invisibleName + 10), ' -_', true);
    if (!match && ofName >= 0)
        match = fuzzymatch(usrbuf, monnambuf.slice(ofName + 4), ' -_', true);
    if (match) {
        if (is_rider(monster.data)) {
            await ttyPline(`${upstart(monnambuf)} is already called that.`, state);
        } else {
            await ttyPline(
                `${upstart(mhe(monster, { state }))} is already called ${monnambuf}.`,
                state,
            );
        }
        return true;
    }

    if (monster.data === state.mons?.[PM_JUIBLEX]
        && strstri(monnambuf, 'Juiblex')
        && usrbuf.toLowerCase() === 'jubilex') {
        await ttyPline(
            `${upstart(monnambuf)} doesn't like being called ${usrbuf}.`,
            state,
        );
        return true;
    }
    return false;
}

function beautiful(state) {
    const cha = acurr(state, A_CHA);
    const feminine = poly_gender(state) === FEMALE;
    if (cha >= 25) return 'sublime';
    if (cha >= 19) return 'splendorous';
    if (cha >= 16) return feminine ? 'beautiful' : 'handsome';
    if (cha >= 14) return feminine ? 'winsome' : 'amiable';
    if (cha >= 11) return 'cute';
    if (cha >= 9) return 'plain';
    if (cha >= 6) return 'homely';
    if (cha >= 4) return 'ugly';
    return 'hideous';
}

function see_with_infrared(monster, state) {
    if (heroIsBlind(state) || !namingPropertyActive(state, INFRAVISION))
        return false;
    if (!(monster.data?.mflags3 & 0x0200)) return false;
    return couldsee(monster.mx, monster.my, state);
}

// C ref: do_name.c do_mgivenname() (199-282).
export async function do_mgivenname(state = game) {
    if (namingPropertyActive(state, HALLUC)
        && !namingPropertyActive(state, HALLUC_RES)) {
        await ttyPline('You would never recognize it anyway.', state);
        return;
    }

    const cc = { x: state.u.ux, y: state.u.uy };
    if (await getpos(cc, false, 'the monster you want to name', state) < 0
        || !isok(cc.x, cc.y)) return;

    let monster = null;
    let doSwallow = false;
    if (u_at(cc.x, cc.y, state)) {
        if (state.u.usteed && canSpotMonster(state.u.usteed, state)) {
            monster = state.u.usteed;
        } else {
            await ttyPline(
                `This ${beautiful(state)} creature is called ${state.plname}`
                + ' and cannot be renamed.',
                state,
            );
            return;
        }
    } else {
        // m_at() is a direct coordinate lookup; importing monst.js here would
        // add a cycle through the command dispatcher, so use the level index.
        monster = state.level?.monsters?.[cc.x]?.[cc.y] ?? null;
    }

    if (!monster && state.u.uswallow) {
        const glyph = glyph_at(cc.x, cc.y, state);
        if (glyph_is_swallow(glyph)) {
            monster = state.u.ustuck;
            doSwallow = true;
        }
    }

    const seeInvisible = namingPropertyActive(state, SEE_INVIS);
    const appearance = monster ? M_AP_TYPE(monster) : 0;
    if (!doSwallow && (!monster
        || (!sensesMonster(monster, state)
            && (!(cansee(cc.x, cc.y, state)
                || see_with_infrared(monster, state))
                || monster.mundetected
                || appearance === M_AP_FURNITURE
                || appearance === M_AP_OBJECT
                || (monster.minvis && !seeInvisible))))) {
        await ttyPline('I see no monster there.', state);
        return;
    }

    const monnambuf = monsterCommonName(monster, state);
    const buf = await name_from_player(
        `What do you want to call ${monnambuf}?`,
        has_mgivenname(monster) ? monster.mextra?.mgivenname : null,
        state,
    );
    if (buf == null) return;

    if ((monster.data?.geno & G_UNIQ) && !monster.ispriest) {
        if (!await alreadynamed(monster, monnambuf, buf, state))
            await ttyPline(`${upstart(monnambuf)} doesn't like being called names!`, state);
    } else if (monster.isshk
        && !namingPropertyActive(state, DEAF)
        && !helpless(monster)
        && (monster.data?.msound ?? 0) > MS_ANIMAL) {
        if (!await alreadynamed(monster, monnambuf, buf, state)) {
            // SetVoice() is a TTY sound no-op in this build.
            await verbalize(`I'm ${shkname(monster, state)}, not ${buf}.`, state);
        }
    } else if (monster.ispriest || monster.isminion || monster.isshk
        || monster.data === state.mons?.[PM_GHOST]
        || has_ebones(monster)) {
        if (!await alreadynamed(monster, monnambuf, buf, state))
            await ttyPline(
                `${upstart(monnambuf)} will not accept the name ${buf}.`,
                state,
            );
    } else {
        christen_monst(monster, buf, { state });
    }
}

// C ref: do_name.c docallcmd() (499-601). The #call / #name command presents
// a "What do you want to name?" menu offering six naming options. When the
// player dismisses the menu without selecting an option (ESC), ch is set to
// 'q' (555), which falls through to case 'q': break (559-562) and returns
// ECMD_OK (600).
//
export async function docallcmd(state) {
    // A canned key bypasses menu creation, exactly as cmdq_pop()'s early arm
    // does in C. Importing here keeps the existing cmd/do_name cycle lazy.
    const { cmdq_clear, cmdq_pop } = await import('./cmd.js');
    const queued = cmdq_pop(state);
    let queuedChoice = null;
    if (queued) {
        if (queued.typ === CMDQ_KEY) {
            queuedChoice = typeof queued.key === 'number'
                ? String.fromCharCode(queued.key)
                : String(queued.key);
        } else {
            cmdq_clear(CQ_CANNED, state);
        }
    }
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

    const choice = queuedChoice ?? await select_menu(state, {
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
    case 'm':
        await do_mgivenname(state);
        break;
    case 'i': {
        const obj = await getobj('name', name_ok, GETOBJ_PROMPT, state);
        if (obj) await do_oname(obj, state);
        break;
    }
    case 'o': {
        const obj = await getobj('call', call_ok, GETOBJ_NOFLAGS, state);
        if (obj) {
            // xname() observes an item picked up while blind, as in C.
            xnameFresh(obj, state);
            if (!obj.dknown) {
                await ttyPline('You would never recognize another one.', state);
            } else {
                await docall(obj, state);
            }
        }
        break;
    }
    case 'f':
        await namefloorobj(state);
        break;
    case 'd':
        note_unported('o_init.c rename_disco()');
        break;
    case 'a': {
        const { donamelevel } = await import('./dungeon.js');
        await donamelevel(state);
        break;
    }
    }
    return ECMD_OK;
}

// C ref: do_name.c docall_xname() (604-633). For safe_qbuf(): strips cosmetic
// attributes from a temporary copy of obj so the "Call <thing>:" prompt shows
// a clean base name.
export function docall_xname(obj, state = game) {
    // Build a shallow temp copy; clear cosmetic fields that doname()/xname()
    // would format but that distract from the base type name.
    const otemp = { ...obj, oextra: null, quan: 1 };
    /* in case water is already known, convert "[un]holy water" to "water" */
    otemp.blessed = false;
    otemp.cursed = false;
    const type = objectType(otemp, state);
    if (type.oc_class === WEAPON_CLASS)
        otemp.opoisoned = 0; /* not poisoned */
    else if (type.oc_class === POTION_CLASS)
        otemp.odiluted = 0; /* not diluted */
    else if (otemp.otyp === TOWEL || otemp.otyp === STATUE)
        otemp.spe = 0; /* not wet or historic */
    else if (otemp.otyp === TIN)
        otemp.known = false; /* suppress tin type (homemade, &c) and mon type */
    else if (otemp.otyp === FIGURINE)
        otemp.corpsenm = NON_PM; /* suppress mon type */
    else if (otemp.otyp === HEAVY_IRON_BALL)
        otemp.owt = state.objects[HEAVY_IRON_BALL].oc_weight; /* not "very heavy" */
    else if (type.oc_class === FOOD_CLASS && otemp.globby)
        otemp.owt = 120; /* 6*20, neither a small glob nor a large one */

    return an(xnameFresh(otemp, state));
}

// C ref: do_name.c name_from_player() (104-128). Wraps getlin() with
// mungspaces() and PL_PSIZ byte truncation. Returns null for empty or ESC.
export async function name_from_player(prompt, defres, state = game) {
    let outbuf = '';
    // EDIT_GETLIN: pass defres as preloaded text (not compiled in standard
    // tty, so this branch is dormant; kept for source fidelity).
    // nhUse(defres);
    outbuf = await getlin(prompt, state);
    if (!outbuf || outbuf.charAt(0) === '\x1b')
        return null;

    /* strip leading and trailing spaces, condense internal sequences */
    outbuf = mungspaces(outbuf);
    const bytes = encodeUtf8ByteString(outbuf);
    if (bytes.length >= PL_PSIZ)
        outbuf = decodeUtf8ByteString(bytes.slice(0, PL_PSIZ - 1));
    return outbuf;
}

// C ref: do_name.c docall() (636-676). Prompts the player to name ("call")
// the object type. Updates oc_uname and the discovery list.
export async function docall(obj, state = game) {
    if (!obj.dknown)
        return; /* probably blind; Blind || Hallucination for 'fromsink' */
    await flush_screen(1); /* buffered updates might matter to player's response */

    let qbuf;
    if (objectType(obj, state).oc_class === POTION_CLASS && obj.fromsink)
        /* fromsink: kludge, meaning it's sink water */
        qbuf = `Call a stream of ${OBJ_DESCR(state.objects[obj.otyp])} fluid:`;
    else
        qbuf = safe_qbuf(
            'Call ', ':', obj, docall_xname, simpleonames, 'thing', state,
        );
    /* pointer to old name */
    const type = state.objects[obj.otyp];
    const hadName = Boolean(type.oc_uname);
    /* use getlin() to get a name string from the player */
    const buf = await name_from_player(qbuf, type.oc_uname, state);
    if (buf == null)
        return;

    /* clear old name */
    if (type.oc_uname) {
        type.oc_uname = null;
    }

    /* strip leading and trailing spaces; uncalls item if all spaces */
    const trimmed = mungspaces(buf);
    if (!trimmed) {
        if (hadName) /* possibly remove from disco[]; old oc_uname is gone */
            undiscover_object(obj.otyp, state);
    } else {
        type.oc_uname = trimmed;
        discover_object(obj.otyp, false, true, true, state); /* possibly add to disco[] */
    }
    if (obj.where === OBJ_INVENT || carrying(obj.otyp, state))
        update_inventory({ state });
}

// C ref: do_name.c do_oname() (290-369). This is the command-side object
// naming path; oname() owns the shared object mutation and artifact ownership.
export async function do_oname(obj, state = game) {
    let objtyp = STRANGE_OBJECT;
    if (obj.otyp === SPE_NOVEL) {
        await ttyPline(`${Ysimple_name2(obj, state)} already has a published name.`, state);
        return;
    }

    const qbuf = safe_qbuf(
        `What do you want to name ${is_plural(obj) ? 'these' : 'this'} `,
        '?', obj, xnameFresh, simpleonames, 'item', state,
    );
    const buf = await name_from_player(qbuf, safe_oname(obj), state);
    if (buf == null) return;

    if (obj.oartifact) {
        await ttyPline(
            `${safe_oname(obj) || 'The artifact'} resists the attempt.`,
            state,
        );
        return;
    }

    const artifactType = {};
    const aname = artifact_name(buf, artifactType, true, state);
    objtyp = artifactType.otyp ?? STRANGE_OBJECT;
    let finalName = buf;
    if (aname && (restrict_name(obj, aname, state)
        || exist_artifact(obj.otyp, aname, state))) {
        finalName = aname;
        const original = finalName;
        const offset = finalName.toLowerCase().startsWith('the ') ? 4 : 0;
        do {
            const prefix = finalName.slice(0, offset);
            const target = finalName.slice(offset);
            finalName = prefix + wipeout_text(target, rnd_on_display_rng(2), 0, {
                random: { rn2: rn2_on_display_rng, rnd: rn2 },
            });
        } while (finalName === original);
        await ttyPline(`While engraving, your ${body_part(HAND, state.youmonst)} slips.`, state);
        await displayPendingTtyMessageWindow(state);
        await ttyPline(`You engrave: "${finalName}".`, state);
        state.u.uconduct ??= {};
        state.u.uconduct.literate = Math.trunc(state.u.uconduct.literate ?? 0) + 1;
    } else if (obj.otyp === objtyp) {
        // artifact_name() set objtyp only when it returned a canonical name.
        // The no-name case leaves the user's spelling intact.
        if (aname) finalName = aname;
    }

    oname(obj, finalName,
        ONAME_VIA_NAMING | ONAME_KNOW_ARTI, { state });
}

// C ref: do_name.c namefloorobj() (678-771). The floor object may be a
// temporary reconstruction returned by pager.c's object_from_map().
export async function namefloorobj(state = game) {
    const cc = { x: state.u.ux, y: state.u.uy };
    const overUnder = state.u.uundetected && hides_under(state.youmonst?.data)
        ? 'over' : 'under';
    const goal = `object on map (or '.' for one ${overUnder} you)`;
    if (await getpos(cc, false, goal, state) < 0 || cc.x <= 0) return;

    let obj = null;
    let fakeobj = false;
    if (u_at(cc.x, cc.y, state)) {
        obj = vobj_at(state.u.ux, state.u.uy, state);
    } else {
        const glyph = glyph_at(cc.x, cc.y, state);
        if (glyph_is_object(glyph)) {
            const pager = await import('./pager.js');
            const mapped = pager.object_from_map(glyph, cc.x, cc.y, state);
            obj = mapped.object;
            fakeobj = mapped.fakeobj;
        }
    }
    if (!obj) {
        await ttyPline(
            `There doesn't seem to be any object ${u_at(cc.x, cc.y, state) ? 'under you' : 'there'}.`,
            state,
        );
        return;
    }

    const buf = obj.otyp !== STRANGE_OBJECT
        ? simpleonames(obj, state)
        : state.obj_descr?.[STRANGE_OBJECT]?.oc_name ?? 'glorkum';
    const usePlural = (obj.quan ?? 1) > 1;
    if (namingPropertyActive(state, HALLUC)
        && !namingPropertyActive(state, HALLUC_RES)) {
        const female = poly_gender(state) === FEMALE;
        const names = [
            female ? state.urole?.name?.f : null,
            rank_of(rn2_on_display_rng(30) + 1, state.urole?.mnum, female, state),
            bogusmon({ state }).name,
            null,
            roguename(state),
            'Wibbly Wobbly',
        ];
        names[0] ??= state.urole?.name?.m ?? 'Adventurer';
        names[3] = names[2];
        await ttyPline(
            `${The(buf, state)} ${usePlural ? 'decide' : 'decides'} to call you "${names[rn2_on_display_rng(6)]}."`,
            state,
        );
    } else if (call_ok(obj, state) === GETOBJ_EXCLUDE) {
        await ttyPline(
            `${usePlural ? 'Those' : 'That'} ${buf} ${usePlural ? "can't" : "can't"} be assigned a type name.`,
            state,
        );
    } else if (!obj.dknown) {
        await ttyPline(
            `You don't know ${usePlural ? 'those' : 'that'} ${buf} well enough to name ${usePlural ? 'them' : 'it'}.`,
            state,
        );
    } else {
        await docall(obj, state);
    }

    if (fakeobj) {
        obj.where = OBJ_FREE;
        dealloc_obj(obj, { state });
    }
}

function namingPropertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

// C ref: youprop.h Hallucination (116-120). Hallucination is the intrinsic
// timeout alone; unlike most properties, an extrinsic bit does not turn it
// on. Either intrinsic or extrinsic hallucination resistance defeats it.
function hallucinationActive(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(hallucination?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
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
function x_monnam_do_it(monster, article, suppress, state, env = {}) {
    const spotMonster = env.canSpotMonster
        ?? env.canSeeMonster
        ?? canSpotMonster;
    return !spotMonster(monster, state)
        && article !== ARTICLE_YOUR
        && !state.program_state?.gameover
        && monster !== state.u?.usteed
        && !engulfing_u(monster, state)
        && !(suppress & SUPPRESS_IT);
}

// C ref: do_name.c x_monnam()'s do_it arm (876-885). When AUGMENT_IT is set,
// the result is "someone" for humanoids or "something" for others, rather than
// the bare "it". Hallucination inverts with rn2(2).
function x_monnam_it(suppress, monster, state, env = {}) {
    if (!(suppress & AUGMENT_IT))
        return 'it';
    const mdat = monster.data;
    const s_one = humanoid(mdat) && !is_animal(mdat) && !mindless(mdat);
    const hallucinating = hallucinationActive(state);
    // x_monnam() uses rn2(), rather than rn2_on_display_rng(), for the
    // someone/something coin flip. Hallucinated species selection below is
    // the display-only path; this branch is ordinary gameplay grammar.
    const random = typeof env.random === 'function'
        ? env.random : env.random?.rn2 ?? rn2;
    if ((!hallucinating || (suppress & SUPPRESS_HALLUCINATION))
        ? s_one : !random(2))
        return 'someone';
    return 'something';
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
export function monsterCommonName(
    monster,
    state = game,
    suppress = 0,
    env = {},
) {
    const hasGivenName = has_mgivenname(monster);
    return x_monnam(
        monster,
        ARTICLE_THE,
        null,
        suppress | (hasGivenName ? SUPPRESS_SADDLE : 0),
        false,
        state,
        env,
    );
}

export function capitalizedMonsterName(monster, state = game, env = {}) {
    const name = monsterCommonName(monster, state, 0, env);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: do_name.c some_mon_nam() (1064-1071). Like mon_nam() but when the
// monster cannot be spotted, answers "someone" or "something" via AUGMENT_IT
// instead of "it".
export function some_mon_nam(monster, state = game, env = {}) {
    const hasGivenName = has_mgivenname(monster);
    const suppress = hasGivenName
        ? (SUPPRESS_SADDLE | AUGMENT_IT)
        : AUGMENT_IT;
    return x_monnam(monster, ARTICLE_THE, null, suppress, false, state, env);
}

// C ref: do_name.c Some_Monnam() (1092-1098). Capitalized some_mon_nam().
export function Some_Monnam(monster, state = game, env = {}) {
    const name = some_mon_nam(monster, state, env);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: do_name.c noit_mon_nam() (1048-1060). Like mon_nam() but suppresses
// "it" so the hero always sees a name (used for probing and aggravation).
export function noit_mon_nam(monster, state = game, env = {}) {
    const hasGivenName = has_mgivenname(monster);
    const suppress = hasGivenName
        ? (SUPPRESS_SADDLE | SUPPRESS_IT)
        : SUPPRESS_IT;
    return x_monnam(monster, ARTICLE_YOUR, null, suppress, false, state, env);
}

// C ref: do_name.c noit_Monnam() (1083-1089). Capitalized noit_mon_nam().
export function noit_Monnam(monster, state = game, env = {}) {
    const name = noit_mon_nam(monster, state, env);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: do_name.c y_monnam() (1117-1129). "your little dog" for pets,
// "the orc" for non-tame monsters.
export function y_monnam(monster, state = game, env = {}) {
    const prefix = monster.mtame ? ARTICLE_YOUR : ARTICLE_THE;
    const hasGivenName = has_mgivenname(monster);
    const suppression_flag = (hasGivenName || monster === state.u?.usteed)
        ? SUPPRESS_SADDLE : 0;
    return x_monnam(monster, prefix, null, suppression_flag, false, state, env);
}

// C ref: do_name.c YMonnam() (1133-1139). Sentence-initial spelling of the
// pet-aware y_monnam() result; highc() changes only its first byte.
export function YMonnam(monster, state = game, env = {}) {
    return upstart(y_monnam(monster, state, env));
}

// C ref: do_name.c noname_monnam() (1102-1105). Suppress an assigned name
// while retaining the visibility, hallucination, and article rules of
// x_monnam(). A unique species with a proper name still wins through C's
// type_is_pname() exception inside x_monnam().
export function noname_monnam(monster, article, state = game, env = {}) {
    return x_monnam(monster, article, null, SUPPRESS_NAME, false, state, env);
}

// C ref: decl.c c_obj_colors[] (20-37). Color names indexed by CLR_* value.
const c_obj_colors = Object.freeze([
    'black',          /* CLR_BLACK   0 */
    'red',            /* CLR_RED     1 */
    'green',          /* CLR_GREEN   2 */
    'brown',          /* CLR_BROWN   3 */
    'blue',           /* CLR_BLUE    4 */
    'magenta',        /* CLR_MAGENTA 5 */
    'cyan',           /* CLR_CYAN    6 */
    'gray',           /* CLR_GRAY    7 */
    'transparent',    /* no_color    8 */
    'orange',         /* CLR_ORANGE  9 */
    'bright green',   /* CLR_BRIGHT_GREEN 10 */
    'yellow',         /* CLR_YELLOW 11 */
    'bright blue',    /* CLR_BRIGHT_BLUE 12 */
    'bright magenta', /* CLR_BRIGHT_MAGENTA 13 */
    'bright cyan',    /* CLR_BRIGHT_CYAN 14 */
    'white',          /* CLR_WHITE  15 */
]);

const CLR_MAX = 16;
const NO_COLOR = 8;

// C ref: do_name.c hcolors[] (1441-1458). Hallucination color names drawn
// from the display RNG. Keep the source order: the same order is part of the
// recorded random stream whenever hcolor() or rndcolor() is reached.
// C ref: do_name.c rndcolor() (1470-1479). Random color from the gameplay
// RNG; if hallucinating, picks a hallucination color from the display RNG
// instead.
export function rndcolor(state = game, env = {}) {
    const random = typeof env.random === 'function'
        ? env.random : env.random?.rn2 ?? rn2;
    const k = random(CLR_MAX);
    return hallucinationActive(state)
        ? hcolor(null, state, env)
        : (k === NO_COLOR) ? 'colorless' : c_obj_colors[k];
}

// C ref: do_name.c hcolor() (1461-1466). A missing or hallucinated preferred
// color always consumes one display-RNG draw; a real preferred color consumes
// none. The optional env keeps deterministic tests on the same seam used by
// x_monnam() without changing the C-shaped state argument.
export function hcolor(colorpref, state = game, env = {}) {
    const hallucinating = hallucinationActive(state);
    if (!hallucinating && colorpref) return colorpref;
    const random = displayRandomFunction(
        env.displayRandom ?? env.random ?? rn2_on_display_rng,
    );
    return HCOLORS[random(HCOLORS.length)];
}

// C ref: do_name.c Adjmonnam() (1142-1149). "The <adj> <monster>".
export function Adjmonnam(monster, adj, state = game, env = {}) {
    const hasGivenName = has_mgivenname(monster);
    const suppress = hasGivenName ? SUPPRESS_SADDLE : 0;
    const name = x_monnam(
        monster, ARTICLE_THE, adj, suppress, false, state, env,
    );
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: do_name.c distant_monnam() (1170-1186). The high priest on a remote
// Astral square is deliberately identified only by rank, so the altar's
// deity and proper name cannot be learned from a distant map glyph.
export function distant_monnam(
    monster,
    article,
    outbuf = undefined,
    state = game,
    env = {},
) {
    const hallucinating = hallucinationActive(state);
    const level = state.u?.uz;
    const astral = Boolean(
        level && state.astral_level
        && level.dnum === state.astral_level.dnum
        && level.dlevel === state.astral_level.dlevel
        && level.dlevel === 1,
    );
    const dx = Math.trunc(monster.mx ?? 0) - Math.trunc(state.u?.ux ?? 0);
    const dy = Math.trunc(monster.my ?? 0) - Math.trunc(state.u?.uy ?? 0);
    const adjacent = dx * dx + dy * dy <= 2;
    const concealed = monster.data === state.mons?.[PM_HIGH_CLERIC]
        && !hallucinating && astral && !adjacent;
    const result = concealed
        ? `${article === ARTICLE_THE ? 'the ' : ''}${monster.female
            ? 'high priestess' : 'high priest'}`
        : x_monnam(monster, article, null, 0, true, state, env);
    if (Array.isArray(outbuf)) outbuf[0] = result;
    else if (outbuf && typeof outbuf === 'object') outbuf.value = result;
    return result;
}

function diagnosticPointer(value) {
    if (value == null) return 'null';
    if (value.m_id !== undefined) return `[mon#${value.m_id}]`;
    return '[?]';
}

// C ref: do_name.c minimal_monnam() (1253-1285). This is a diagnostic helper;
// source pointer ranges have no direct JavaScript equivalent, so the catalog
// index and stable object id stand in for fmt_ptr() while preserving every
// message branch and the long-worm-tail check.
export function minimal_monnam(monster, ckloc, state = game) {
    nextmbuf();
    const out = (value) => value;
    if (!monster) return out('[Null monster]');
    const species = monster.data;
    if (!species) return out('[Null mon->data]');
    const index = species.pmidx;
    if (!Number.isInteger(index) || index < 0) {
        return out(`[Invalid mon.data ${diagnosticPointer(species)} < ${
            diagnosticPointer(state.mons?.[0])}]`);
    }
    if (index >= NUMMONS) {
        return out(`[Invalid mon.data ${diagnosticPointer(species)} >= ${
            diagnosticPointer(state.mons?.[NUMMONS])}]`);
    }
    if (ckloc && index === PM_LONG_WORM && monster.mx
        && state.level?.monsters?.[monster.mx]?.[monster.my] !== monster) {
        return `${pmname(state.mons[PM_LONG_WORM_TAIL], Mgender(monster, state))} <${
            monster.mx},${monster.my}>`;
    }
    const prefix = monster.mtame ? 'tame '
        : monster.mpeaceful ? 'peaceful ' : '';
    let result = `${prefix}${mon_pmname(monster, state)} <${monster.mx ?? 0},${
        monster.my ?? 0}>`;
    if (monster.cham !== undefined && monster.cham !== NON_PM
        && Number.isInteger(monster.cham)
        && state.mons?.[monster.cham]) {
        result += `{${pmname(state.mons[monster.cham], Mgender(monster, state))}}`;
    }
    return result;
}

// C ref: do_name.c Mgender() (1288-1300). Monster gender is a binary bit,
// except that the hero's bit comes from her current form while polymorphed.
export function Mgender(monster, state = game) {
    if (monster === state.youmonst) {
        const female = Upolyd(state.u)
            ? state.u?.mfemale
            : state.flags?.female;
        return female ? FEMALE : MALE;
    }
    return monster?.female ? FEMALE : MALE;
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
export function mon_pmname(monster, state = game) {
    return pmname(monster.data, Mgender(monster, state));
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

// C ref: do_name.c x_monnam() (826-1032). The wrappers below expose its
// source callers' article and suppression combinations, while existing game
// modules use monsterCommonName()/capitalizedMonsterName() for mon_nam() and
// Monnam(). Every path shares this one formatter so its RNG and visibility
// decisions stay aligned.
export function x_monnam(
    monster,
    article,
    adjective,
    suppress,
    called,
    state = game,
    env = {},
) {
    // C obtains its reusable output slot before the first early return.
    nextmbuf();
    if (monster === state.youmonst) return 'you';
    const mdat = monster.data;

    let effectiveSuppress = suppress;
    // do_name.c:845-846. Disclosure names every monster truly, so the game
    // being over suppresses hallucination however the caller asked.
    if (state.program_state?.gameover)
        effectiveSuppress |= SUPPRESS_HALLUCINATION;

    let effectiveArticle = article;
    if (effectiveArticle === ARTICLE_YOUR && !monster.mtame)
        effectiveArticle = ARTICLE_THE;
    // do_name.c:851-859. A swallower is worth "the", and its interior is
    // visible however invisible it is outside, so SUPPRESS_INVISIBLE joins the
    // caller's flags here rather than being demanded of the caller.
    if (state.u?.uswallow && monster === state.u.ustuck) {
        effectiveArticle = ARTICLE_THE;
        effectiveSuppress |= SUPPRESS_INVISIBLE;
    }

    // do_name.c:861-862.
    const do_hallu = hallucinationActive(state)
        && !(effectiveSuppress & SUPPRESS_HALLUCINATION);
    const do_invis = Boolean(monster.minvis)
        && !(effectiveSuppress & SUPPRESS_INVISIBLE);

    // do_name.c:876-885, above the priest and minion block C reaches next.
    if (x_monnam_do_it(monster, effectiveArticle, effectiveSuppress, state, env))
        return x_monnam_it(effectiveSuppress, monster, state, env);

    const do_saddle = !(effectiveSuppress & SUPPRESS_SADDLE);
    const do_mappear = ((monster.m_ap_type ?? 0) & M_AP_TYPMASK)
        === M_AP_MONSTER && !(effectiveSuppress & SUPPRESS_MAPPEARANCE);
    const do_name = !(effectiveSuppress & SUPPRESS_NAME)
        || type_is_pname(mdat);

    if ((monster.ispriest || monster.isminion) && !do_mappear) {
        const properties = state.u?.uprops;
        const resistance = properties?.[HALLUC_RES];
        const hadResistance = resistance != null;
        const savedResistance = resistance?.extrinsic;
        const savedInvisible = monster.minvis;
        let name;
        try {
            if (!do_hallu && properties) {
                if (resistance) resistance.extrinsic = 1;
                else properties[HALLUC_RES] = { extrinsic: 1 };
            }
            if (!do_invis) monster.minvis = 0;
            name = priestname(monster, effectiveArticle,
                (effectiveSuppress & EXACT_NAME) === EXACT_NAME, state, env);
        } finally {
            if (!do_hallu && properties) {
                if (hadResistance) resistance.extrinsic = savedResistance;
                else delete properties[HALLUC_RES];
            }
            monster.minvis = savedInvisible;
        }
        return effectiveArticle === ARTICLE_NONE && name.startsWith('the ')
            ? name.slice(4) : name;
    }

    // do_name.c:907-910. A monster-shaped appearance replaces only the base
    // species name. The given-name and article decisions below continue to
    // read the real monster species, which produces C's deliberately odd
    // article when the apparent species has a personal name.
    const pm_name = do_mappear
        ? pmname(
            state.mons?.[monster.mappearance] ?? mdat,
            Mgender(monster, state),
        )
        : mon_pmname(monster, state);
    let buf = '';
    if (monster.isshk && !do_hallu && !do_mappear) {
        if (adjective && effectiveArticle === ARTICLE_THE)
            return `the ${adjective} ${shkname(monster, state, env)}`;
        buf = shkname(monster, state, env);
        // A reduced fixture can mark a monster as a shopkeeper without the
        // eshk record that C's shkname() requires. Keep its fallback name
        // intact instead of appending the same species a second time.
        if (!monster.mextra?.eshk) return buf;
        // A reduced diagnostic fixture can omit the global monster catalog;
        // its only possible shopkeeper species is still the ordinary one.
        if (mdat !== state.mons?.[PM_SHOPKEEPER]
            && state.mons?.[PM_SHOPKEEPER])
            buf += ` the ${do_invis ? 'invisible ' : ''}${pm_name}`;
        else if (do_invis)
            buf += ` the ${do_invis ? 'invisible ' : ''}${pm_name}`;
        return buf;
    }

    if (adjective) buf += `${adjective} `;
    if (do_invis) buf += 'invisible ';
    // do_name.c:938-941 reads Blind and Hallucination directly here, not
    // do_hallu, so SUPPRESS_HALLUCINATION does not restore the saddle.
    if (do_saddle && (monster.misc_worn_check & W_SADDLE)
        && !heroIsBlind(state)
        && !hallucinationActive(state))
        buf += 'saddled ';
    const has_adjectives = buf !== '';

    let name_at_start;
    const givenName = has_mgivenname(monster)
        ? (monster.mextra?.mgivenname ?? monster.mgivenname)
        : '';
    if (do_hallu) {
        // do_name.c:949-955. The bogus name replaces the species outright,
        // after the adjectives already in the buffer. rndmonnam() spends the
        // display RNG, not the gameplay RNG.
        const randomName = rndmonnamDetails({
            state,
            random: env.displayRandom ?? rn2_on_display_rng,
        });
        buf += randomName.name;
        name_at_start = bogon_is_pname(randomName.code);
    } else if (do_name && givenName) {
        if (mdat === state.mons?.[PM_GHOST]) {
            // C ref: do_name.c x_monnam():964-967. The ghost's given name
            // takes the possessive form even when `called` is requested.
            buf += `${s_suffix(givenName)} ghost`;
            name_at_start = true;
        } else if (called) {
            buf += `${pm_name} called ${givenName}`;
            name_at_start = type_is_pname(mdat);
        } else if (is_mplayer(mdat) && / the /iu.test(givenName)) {
            const insertion = givenName.toLowerCase().indexOf(' the ') + 5;
            buf = givenName.slice(0, insertion) + buf + givenName.slice(insertion);
            effectiveArticle = ARTICLE_NONE;
            name_at_start = true;
        } else {
            buf += givenName;
            name_at_start = true;
        }
    } else if (is_mplayer(mdat) && !(
        state.astral_level
        && state.u?.uz
        && state.u.uz.dnum === state.astral_level.dnum
    )) {
        buf += rank_of(monster.m_lev, mdat.pmidx, monster.female, state)
            .toLowerCase();
        name_at_start = false;
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
// SUPPRESS_IT is the whole point of this wrapper: C's comment at 1049-1052
// says it names a monster "as if the player can always see" it.
export function alwaysVisibleMonsterName(
    monster,
    state = game,
    env = {},
) {
    return noit_mon_nam(monster, state, env);
}

export function capitalizedAlwaysVisibleMonsterName(
    monster,
    state = game,
    env = {},
) {
    const name = alwaysVisibleMonsterName(monster, state, env);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

// C ref: do_name.c mon_nam_too() (1189-1216). The object of a verb whose
// subject is `other_mon`: an ordinary name when the two differ, and a
// reflexive pronoun when they are the same monster.
//
// C's `case 2` shares its body with `default`, so any row of role.c genders[]
// other than male, female and "they" reads as neuter. pronoun_gender() spends
// an rn2(4) for a hallucinating hero and needs canspotmon() otherwise. The
// normal owner is supplied here; an explicit caller override remains intact.
export function mon_nam_too(mon, other_mon, state = game, env = {}) {
    if (mon !== other_mon) return mon_nam(mon, state, env);
    // do_name.c takes a fresh nextmbuf() slot for the reflexive result.
    nextmbuf();
    switch (pronoun_gender(mon, PRONOUN_HALLU, {
        canSpotMonster,
        ...env,
        state,
    })) {
    case 0: return 'himself';
    case 1: return 'herself';
    case 3: /* "could happen when hallucinating" */
        return 'themselves';
    default:
    case 2: return 'itself';
    }
}

// C ref: do_name.c monverbself() (1221-1252). Builds "Foo zaps itself" from
// a monster name, a verb, an optional infix, and a reflexive pronoun.
// Under hallucination the pronoun can be "themselves", which keeps the verb
// plural and pluralizes the monster name.
export function monverbself(mon, monnamtext, verb, othertext,
    state = game, env = {}) {
    // "himself"/"herself"/"itself", maybe "themselves" if hallucinating
    const selfbuf = mon_nam_too(mon, mon, state, env);
    // verb starts plural; vtense yields singular except for "themselves"
    const verbs = vtense(selfbuf, verb);
    let result = monnamtext;
    if (verb === verbs) { /* a match indicates that it stayed plural */
        result = makeplural(result);
        /* for "it", makeplural() produces "they" but we want "them" as
           the object-position pronoun (C genders[3]: he="they" him="them") */
        if (result.toLowerCase() === 'they') {
            const capitaliz = result[0] === result[0].toUpperCase();
            result = capitaliz ? 'Them' : 'them';
        }
    }
    result += ' ' + verbs;
    if (othertext && othertext.length)
        result += ' ' + othertext;
    result += ' ' + selfbuf;
    return result;
}

// C ref: hacklib.c s_suffix() over mon_nam()/Monnam(), which is how mhitm.c
// hitmm() spells the AT_TENT line at 687-690. The suffix comes from the ported
// function rather than from an apostrophe rule written here, because
// s_suffix() special-cases "it" and "you" case-blind: C answers "Its
// tentacles suck", and a bare apostrophe rule answers "It's".
export function monsterPossessive(
    monster,
    state = game,
    capitalized = false,
    env = {},
) {
    const name = capitalized
        ? capitalizedMonsterName(monster, state, env)
        : monsterCommonName(monster, state, 0, env);
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
export function rndmonnamDetails(env = {}) {
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

// C ref: do_name.c a_monnam() (1152-1156), which delegates to x_monnam()
// with ARTICLE_A.  makemon.c's runtime creation message and hack.c's
// monster-behind-the-boulder arm therefore share every special naming branch,
// including priests, shopkeepers and player monsters.
export function a_monnam(monster, env = {}) {
    const state = env.state ?? game;
    const hasGivenName = has_mgivenname(monster);
    const suppress = hasGivenName ? SUPPRESS_SADDLE : 0;
    return x_monnam(monster, ARTICLE_A, null, suppress, false,
        state, env);
}

// C ref: do_name.c l_monnam() (1035-1039). Like mon_nam() with ARTICLE_NONE:
// lowercase, no article. Named monsters suppress the saddle adjective.
export function l_monnam(monster, state = game, env = {}) {
    const hasGivenName = has_mgivenname(monster);
    return x_monnam(monster, ARTICLE_NONE, null,
        hasGivenName ? SUPPRESS_SADDLE : 0, true, state, env);
}

// C ref: do_name.c mon_nam() (1042-1046). Ordinary definite monster name.
export function mon_nam(monster, state = game, env = {}) {
    const hasGivenName = has_mgivenname(monster);
    return x_monnam(monster, ARTICLE_THE, null,
        hasGivenName ? SUPPRESS_SADDLE : 0, false, state, env);
}

// C ref: do_name.c Monnam() (1151-1156), mon_nam() with its first letter
// raised by highc().
export function Monnam(monster, state = game, env = {}) {
    return upstart(mon_nam(monster, state, env));
}

// C ref: do_name.c m_monnam() (1110-1113). EXACT_NAME carries the source's
// suppression bits, so this reports the monster's own name.
export function m_monnam(monster, state = game, env = {}) {
    return x_monnam(monster, ARTICLE_NONE, null,
        EXACT_NAME,
        false, state, env);
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
        env.displayRandom ?? env.random ?? rn2_on_display_rng,
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

// C ref: do_name.c coyotename() (1525-1535). C writes into the caller's
// buffer; arrays and `{ value }` cells are the port's mutable out-buffer
// conventions, while the returned string is convenient for ordinary callers.
const COYOTE_NAMES = Object.freeze([
    'Carnivorous Vulgaris', 'Road-Runnerus Digestus', 'Eatibus Anythingus',
    'Famishus-Famishus', 'Eatibus Almost Anythingus', 'Eatius Birdius',
    'Famishius Fantasticus', 'Eternalii Famishiis', 'Famishus Vulgarus',
    'Famishius Vulgaris Ingeniusi', 'Eatius-Slobbius',
    'Hardheadipus Oedipus', 'Carnivorous Slobbius',
    'Hard-Headipus Ravenus', 'Evereadii Eatibus', 'Apetitius Giganticus',
    'Hungrii Flea-Bagius', 'Overconfidentii Vulgaris', 'Caninus Nervous Rex',
    'Grotesques Appetitus', 'Nemesis Ridiculii', 'Canis latrans',
]);

export function coyotename(monster, outbuf, state = game, env = {}) {
    if (!monster || !outbuf) return outbuf;
    const personal = x_monnam(
        monster, ARTICLE_NONE, null, 0, true, state, env,
    );
    const suffix = monster.mcan
        ? COYOTE_NAMES[COYOTE_NAMES.length - 1]
        : COYOTE_NAMES[monster.m_id % (COYOTE_NAMES.length - 1)];
    const result = `${personal} - ${suffix}`;
    if (Array.isArray(outbuf)) outbuf[0] = result;
    else if (typeof outbuf === 'object') outbuf.value = result;
    return result;
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

// C ref: do_name.c lookup_novel(). Preserve an already valid generated index
// when the supplied title is unknown; sp_lev.c uses only the updated index and
// leaves the explicitly supplied object name intact.
export function lookup_novel(lookname, novelidx = undefined, env = {}) {
    const state = env.state ?? game;
    let sought = String(lookname);
    const titled = () => The(sought, state);
    if (sameTitle(
        titled(),
        'The Color of Magic',
    )) {
        sought = SIR_TERRY_NOVELS[0];
    } else if (sameTitle(sought, 'Sorcery')) {
        sought = SIR_TERRY_NOVELS[4];
    } else if (sameTitle(sought, 'Masquerade')) {
        sought = SIR_TERRY_NOVELS[17];
    } else if (sameTitle(
        titled(),
        'The Amazing Maurice',
    )) {
        sought = SIR_TERRY_NOVELS[27];
    } else if (sameTitle(sought, 'Thud')) {
        sought = SIR_TERRY_NOVELS[33];
    }

    const matchedIndex = SIR_TERRY_NOVELS.findIndex(
        (title) => sameTitle(sought, title)
            || sameTitle(titled(), title),
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
