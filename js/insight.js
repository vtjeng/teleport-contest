// insight.js -- the attributes window that `^X` opens, and the one-line
// reports a stethoscope produces for the hero and for a monster.
// C ref: src/insight.c enlght_out(), enlght_line(), enl_msg(), you_are(),
// you_have(), attrval(), fmt_elapsed_time(), enlightenment(),
// background_enlightenment(), basics_enlightenment(),
// characteristics_enlightenment(), one_characteristic(),
// status_enlightenment(), weapon_insight(), attributes_enlightenment(),
// doattributes(), align_str(), size_str(), piousness(), mstatusline(), and
// ustatusline().
//
// `doattributes()` is the normal caller, so `mode` is BASICENLIGHTENMENT, or
// BASICENLIGHTENMENT | MAGICENLIGHTENMENT under playmode:explore and
// playmode:debug, and `final` is ENL_GAMEINPROGRESS. The ordinary dead
// disclosure caller also uses BASICENLIGHTENMENT | MAGICENLIGHTENMENT with
// ENL_GAMEOVERDEAD. `enlightenment()` refuses other final modes and
// polymorphed heroes. `mode` is unchecked, because its two bits pick the same
// sections here that they pick at insight.c:405-423. The next caller
// to arrive gets no refusal from that: the potion of enlightenment
// (potion.c:710), the wand and spell (zap.c do_enlightenment_effect()), a
// quaffed fountain's self-knowledge (fountain.c:290) and an invoked artifact
// (artifact.c:2163) all pass MAGICENLIGHTENMENT alone, a mode no differential
// has covered, so each owns validating its own call. The `final` parameter is
// still threaded through the sections, so the signatures and call shapes match
// the C; the remaining final modes are not validated. A site that collapses C's
// three-way choice on `final` says so in a comment, so end-of-game disclosure
// can find the supported dead mode.
//
// attributes_enlightenment() covers the debug in-progress lines reached by
// the authorized wizard case, together with the ordinary lines already
// ported. Its own comment says which remaining branches are refused.
//
// C interleaves add_menu_str() with the walk that produces each line. Nothing
// between them waits for input or draws, so this collects the finished list
// first and hands it to the window owner, as o_init.c dodiscovered() does.

import {
    A_CHA,
    A_CHAOTIC,
    A_CON,
    A_CURRENT,
    A_DEX,
    A_INT,
    A_LAWFUL,
    A_NEUTRAL,
    A_NONE,
    A_ORIGINAL,
    A_STR,
    A_WIS,
    AC_MAX,
    ACH_RNK1,
    ACH_RNK8,
    ACID_RES,
    ADORNED,
    AGGRAVATE_MONSTER,
    ANTIMAGIC,
    ARTICLE_YOUR,
    BASICENLIGHTENMENT,
    BLINDED,
    BLND_RES,
    CLAIRVOYANT,
    COLD_RES,
    CONFLICT,
    CONFUSION,
    DEAF,
    DETECT_MONSTERS,
    DISINT_RES,
    DISPLACED,
    DRAIN_RES,
    EDOG,
    ENL_GAMEINPROGRESS,
    ENL_GAMEOVERDEAD,
    EXT_ENCUMBER,
    FAST,
    FIRE_RES,
    FIXED_ABIL,
    FROMEXPER,
    FROMOUTSIDE,
    FROM_RACE,
    FROM_FORM,
    FLYING,
    FREE_ACTION,
    FULL_MOON,
    FUMBLING,
    GLIB,
    HALF_PHDAM,
    HALF_SPDAM,
    HALLUC,
    HALLUC_RES,
    HANDED,
    HUNGER,
    HVY_ENCUMBER,
    In_endgame,
    In_quest,
    INFRAVISION,
    INVIS,
    INVULNERABLE,
    Is_bigroom,
    Is_knox_level,
    Is_rogue_level,
    ismnum,
    JUMPING,
    LEVITATION,
    LIFESAVED,
    LOW_PM,
    M_AP_NOTHING,
    MAGICAL_BREATHING,
    MAGICENLIGHTENMENT,
    MFAST,
    MOD_ENCUMBER,
    MSLOW,
    N_ACH,
    NEW_MOON,
    NO_SPELL,
    OVERLOADED,
    P_ISRESTRICTED,
    P_NONE,
    P_SKILLED,
    P_TWO_WEAPON_COMBAT,
    P_UNSKILLED,
    PASSES_WALLS,
    plur,
    POISON_RES,
    POLYMORPH,
    POLYMORPH_CONTROL,
    PROT_FROM_SHAPE_CHANGERS,
    PROTECTION,
    REFLECTING,
    REGENERATION,
    SEARCHING,
    SEE_INVIS,
    SHOCK_RES,
    SICK,
    SICK_RES,
    SLEEP_RES,
    SLEEPY,
    SLIMED,
    TIMEOUT,
    SLOW_DIGESTION,
    SLT_ENCUMBER,
    STEALTH,
    STONE_RES,
    STONED,
    STR18,
    STRANGLED,
    STRAT_WAITMASK,
    STUNNED,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    SWIMMING,
    TELEPAT,
    TELEPORT,
    TELEPORT_CONTROL,
    UNCHANGING,
    UNENCUMBERED,
    Upolyd,
    VOMITING,
    WARN_OF_MON,
    WARN_UNDEAD,
    W_AMUL,
    W_ARMOR,
    W_RING,
    W_TOOL,
    WARNING,
    WOUNDED_LEGS,
    WWALKING,
} from './const.js';
import { timet_delta } from './allmain.js';
import { effective_attribute, role_abil, stone_luck } from './attrib.js';
import { getnow, midnight, night } from './calendar.js';
import { enc_stat } from './display.js';
import { depth, dunlev, endgamelevelname } from './dungeon.js';
import { hu_stat } from './eat.js';
import { game } from './gstate.js';
import { newuexp } from './exper.js';
import { inv_weight, near_capacity } from './hack.js';
import { lcase, lowc, highc, mungspaces, strsubst } from './hacklib.js';
import { carrying, currency, money_cnt } from './invent.js';
import { makeplural } from './fruit.js';
import { an, ysimple_name } from './objnam.js';
import { oc_to_str } from './options.js';
import {
    CLOAK_OF_MAGIC_RESISTANCE,
    DUNCE_CAP,
    DWARVISH_CLOAK,
    GAUNTLETS_OF_POWER,
    GREEN_DRAGON_SCALE_MAIL,
    GREEN_DRAGON_SCALES,
    LUCKSTONE,
    RIN_SUSTAIN_ABILITY,
    ROBE,
    SHIELD_OF_REFLECTION,
    TOWEL,
} from './objects.js';
import { confers_luck } from './artifacts.js';
import { stuck_ring } from './do_wear.js';
import { magic_negation } from './mhitu.js';
import {
    amphibious,
    breathless,
    hates_silver,
    is_clinger,
    lays_eggs,
} from './mondata.js';
import {
    MZ_GIGANTIC,
    MZ_HUGE,
    MZ_LARGE,
    MZ_MEDIUM,
    MZ_SMALL,
    MZ_TINY,
    PM_LONG_WORM,
} from './monsters.js';
import { x_monnam } from './do_name.js';
import { mon_aligntyp } from './priest.js';
import { align_gname, can_pray, u_gname } from './pray.js';
import { spellid } from './spell.js';
import { is_ammo, isMetallic, objectType } from './obj.js';
import { body_part } from './polyself.js';
import { visible_region_at } from './region.js';
import { mhidden_description } from './startup_a11y.js';
import {
    genders,
    rankOf,
    ROLE_FEMALE,
    ROLE_GENDMASK,
    ROLE_MALE,
} from './roles.js';
import { costly_spot } from './shk.js';
import { ttyPline } from './tty_message.js';
import { find_ac } from './u_init_inventory_attrs.js';
import { hidden_gold } from './vault.js';
import { find_mac } from './worn.js';
import {
    can_advance,
    skill_level_name,
    skill_name,
    weapon_descr,
} from './weapon.js';
import { P_SKILL, weapon_type } from './startup_skills.js';
import { empty_handed } from './wield.js';
import { ART_OGRESMASHER } from './artifacts.js';
import { RIGHT_HANDED } from './u_init.js';

// Thrown where insight.c reaches a branch this port has not ported. Every
// throw happens while the line list is still being built, so the window has
// drawn nothing and the keystroke stays retryable.
export class UnsupportedEnlightenmentError extends Error {
    constructor(branch) {
        super(`the attributes window requires ${branch}`);
        this.name = 'UnsupportedEnlightenmentError';
        this.branch = branch;
    }
}

// C ref: insight.c's shared sentence fragments.
const You_ = 'You ';
const are = 'are ';
const were = 'were ';
const have = 'have ';
const had = 'had ';
const can = 'can ';
const could = 'could ';

// C ref: insight.c enlght_line()'s contra[].
const contra = Object.freeze([
    [' are not ', " aren't "],
    [' were not ', " weren't "],
    [' have not ', " haven't "],
    [' had not ', " hadn't "],
    [' can not ', " can't "],
    [' could not ', " couldn't "],
]);

// C ref: attrib.c attrname[], in attrib.h's A_* order.
const attrname = Object.freeze([
    'strength', 'intelligence', 'wisdom',
    'dexterity', 'constitution', 'charisma',
]);

// C ref: youprop.h. This asks only whether a property is present as an
// intrinsic or an extrinsic. Several macros read more than those two fields,
// so a new output path must check youprop.h before reusing this helper rather
// than assuming the answers agree:
//
// - Two macros read a term that makes them TRUE where this helper is FALSE:
//   `Deaf` (youprop.h:125) also reads u.uroleplay.deaf, and `Flying`
//   (youprop.h:253) also reads `u.usteed && is_flyer(u.usteed->data)`. Only
//   these two can let a condition slip past a guard built on this helper.
// - Every other macro's extra terms only remove TRUEs, so this helper is a
//   superset of the macro. `Blind` (:103), `Hallucination` (:120),
//   `Levitation` (:240) and `Wwalking` (:260) each subtract a blocking term;
//   `Fixed_abil` (:385) is the extrinsic alone; and Stunned, Confusion, Sick,
//   Stoned, Strangled, Vomiting, Glib and Slimed are the intrinsic alone.
//
// A guard that only has to notice an unported condition may use the superset
// deliberately, because refusing early is safe. A guard whose answer selects
// between two ported outputs may not, and neither may a guard for one of the
// two macros in the first bullet.
function hasProperty(state, propidx) {
    const property = state.u.uprops?.[propidx];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// hasProperty() widened by the blocked field. attributes_enlightenment() has
// arms that fire on `.blocked` alone -- BLevitation, BFlying, BStealth,
// BInvis, BClairvoyant and the Eyes of the Overworld arm of BBlinded -- so a
// stop for one of those properties has to notice a hero who carries only the
// blocking term. Every macro this widening covers is a subset of it, with the
// two exceptions the hasProperty() comment above names, so a stop built on it
// still only ever fires early.
function propertyInPlay(state, propidx) {
    const property = state.u.uprops?.[propidx];
    return Boolean(property?.intrinsic || property?.extrinsic
        || property?.blocked);
}

// C ref: insight.c cause_known(). Checks whether the hero is wearing something
// the player definitely knows confers the target property. The item must have
// been seen (dknown) and its type discovered (oc_name_known). Simpler than
// from_what()/what_gives(): does not attempt to handle artifacts and
// deliberately ignores wielded items.
export function cause_known(propidx, state) {
    const mask = W_ARMOR | W_AMUL | W_RING | W_TOOL;
    for (let o = state.invent; o; o = o.nobj) {
        if (!(o.owornmask & mask))
            continue;
        const type = objectType(o, state);
        if (type.oc_oprop === propidx && type.oc_name_known && o.dknown)
            return true;
    }
    return false;
}

// C ref: attrib.c is_innate() and from_what(). Keep the source wording used by
// the debug enlightenment window for innate abilities whose role/race tables
// are available here. An unrecognized extrinsic source remains a boundary so
// an equipment-specific explanation is never silently replaced with the wrong
// text.
function attributeSource(propidx, state) {
    if (!state.wizard) return '';
    const property = state.u.uprops?.[propidx] ?? {};
    const roleEntry = role_abil(state.urole?.mnum)?.find(
        (entry) => entry.ability === propidx
            && state.u.ulevel >= entry.ulevel,
    );
    if (roleEntry)
        return roleEntry.ulevel === 1
            ? ' innately' : ' because of your experience';
    if (property.intrinsic & FROM_RACE)
        return ' innately';
    if (property.intrinsic & FROMOUTSIDE)
        return ' intrinsically';
    if (property.intrinsic & FROM_FORM)
        return ' from your creature form';
    if (property.extrinsic)
        throw new UnsupportedEnlightenmentError(
            `the source of ${propidx} resistance`,
        );
    // A timeout without a source is what C's from_what() reports as empty.
    if (property.intrinsic & (FROMEXPER | FROM_RACE))
        throw new UnsupportedEnlightenmentError(
            `the innate source of property ${propidx}`,
        );
    return '';
}

// C ref: insight.c enlght_out(). ge.en_via_menu is TRUE for every ^X, so each
// line becomes an add_menu_str() entry.
function enlght_out(lines, buf) {
    lines.push(buf);
}

// C ref: insight.c enlght_line().
function enlght_line(lines, start, middle, end, ps) {
    let buf = ` ${start}${middle}${end}${ps}.`;
    if (buf.includes(' not ')) {
        for (const [twowords, contrctn] of contra)
            buf = strsubst(buf, twowords, contrctn);
    }
    enlght_out(lines, buf);
}

// C ref: insight.c enl_msg(), you_are(), and you_have().
function enl_msg(lines, final, prefix, present, past, suffix, ps) {
    enlght_line(lines, prefix, final ? past : present, suffix, ps);
}

function you_are(lines, final, attr, ps) {
    enl_msg(lines, final, You_, are, were, attr, ps);
}

function you_have(lines, final, attr, ps) {
    enl_msg(lines, final, You_, have, had, attr, ps);
}

function you_can(lines, final, attr, ps) {
    enl_msg(lines, final, You_, can, could, attr, ps);
}

// C ref: insight.c you_have_X(). Its past-tense argument is the empty string
// rather than `had`, so under final disclosure the line reads "You <X>."
function you_have_X(lines, final, something) {
    enl_msg(lines, final, You_, have, '', something, '');
}

// C ref: insight.c align_str().
export function align_str(alignment) {
    switch (alignment) {
    case A_CHAOTIC: return 'chaotic';
    case A_NEUTRAL: return 'neutral';
    case A_LAWFUL: return 'lawful';
    case A_NONE: return 'unaligned';
    default: return 'unknown';
    }
}

// C ref: insight.c size_str() (3202-3231). The six named sizes of
// monflag.h:177-183, plus the fallback C keeps for a value outside them.
// MZ_HUMAN is MZ_MEDIUM under another spelling, so it needs no arm of its own.
export function size_str(msize) {
    switch (msize) {
    case MZ_TINY: return 'tiny';
    case MZ_SMALL: return 'small';
    case MZ_MEDIUM: return 'medium';
    case MZ_LARGE: return 'large';
    case MZ_HUGE: return 'huge';
    case MZ_GIGANTIC: return 'gigantic';
    default: return `unknown size (${msize})`;
    }
}

// C ref: insight.c piousness() (3234-3271), used for self-probing. `showneg`
// selects between naming how far the hero has fallen and the single word
// "insufficiently"; ustatusline(), the only ported caller, passes FALSE.
//
// A record of exactly 3 answers the empty adverb, and C then joins the suffix
// with no separating space, so the caller's suffix stands alone.
export function piousness(showneg, suffix, state = game) {
    const record = state.u.ualign.record;
    /* note: piousness 20 matches MIN_QUEST_ALIGN (quest.h) */
    const pio = record >= 20 ? 'piously'
        : record > 13 ? 'devoutly'
            : record > 8 ? 'fervently'
                : record > 3 ? 'stridently'
                    : record === 3 ? ''
                        : record > 0 ? 'haltingly'
                            : record === 0 ? 'nominally'
                                : !showneg ? 'insufficiently'
                                    : record >= -3 ? 'strayed'
                                        : record >= -8 ? 'sinned'
                                            : 'transgressed';

    let buf = pio;
    // C tests `suffix` for NULL, not for emptiness: an empty string is a
    // non-NULL pointer, so C appends the separating space for it and this
    // must too. A plain truthiness test would take the other branch.
    if (suffix != null && (!showneg || record >= 0)) {
        if (record !== 3) buf += ' ';
        buf += suffix;
    }
    return buf;
}

// C ref: insight.c attrval(). Strength above 18 reads as "18/xx" up to
// 18/100, and as a plain 19 through 25 above that.
export function attrval(attrindx, attrvalue) {
    if (attrindx !== A_STR || attrvalue <= 18) return `${attrvalue}`;
    if (attrvalue > STR18(100)) return `${attrvalue - 100}`;
    /* simplify "18/\**" to be "18/100" */
    return `18/${String(attrvalue - 18).padStart(2, '0')}`;
}

// C ref: insight.c fmt_elapsed_time(). Fields whose value is zero are left
// out; the recorder's fixed clock makes every elapsed time zero, which is the
// " none" case C says should never happen.
export function fmt_elapsed_time(final, state = game) {
    let etim = state.urealtime.realtime;
    if (!final)
        etim += timet_delta(getnow(state), state.urealtime.start_timing);
    const eseconds = etim % 60;
    etim = Math.trunc(etim / 60);
    const eminutes = etim % 60;
    etim = Math.trunc(etim / 60);
    const ehours = etim % 24;
    const edays = Math.trunc(etim / 24);
    let fieldcnt = (edays ? 1 : 0) + (ehours ? 1 : 0)
        + (eminutes ? 1 : 0) + (eseconds ? 1 : 0);

    let outbuf = fieldcnt ? '' : ' none';
    if (edays) {
        outbuf += ` ${edays} day${plur(edays)}`;
        if (fieldcnt > 1) outbuf += (fieldcnt === 2) ? ' and' : ',';
        --fieldcnt;
    }
    if (ehours) {
        outbuf += ` ${ehours} hour${plur(ehours)}`;
        if (fieldcnt > 1) outbuf += (fieldcnt === 2) ? ' and' : ',';
        --fieldcnt;
    }
    if (eminutes) {
        outbuf += ` ${eminutes} minute${plur(eminutes)}`;
        if (fieldcnt > 1) outbuf += ' and';
    }
    if (eseconds) outbuf += ` ${eseconds} second${plur(eseconds)}`;
    return outbuf;
}

// C ref: insight.c background_enlightenment(). Role, race, alignment,
// deities, dungeon level, elapsed turns, and experience.
function background_enlightenment(final, state, lines) {
    const { u, flags } = state;
    const innategend = flags.female ? 1 : 0;
    const role_titl = (innategend && state.urole.name.f)
        ? state.urole.name.f : state.urole.name.m;
    const rank_titl = rankOf(state.urole, u.ulevel, innategend === 1);

    enlght_out(lines, ''); /* separator after title */
    enlght_out(lines, 'Background:');

    /* report role; omit gender if it's redundant (eg, "female priestess") */
    let tmpbuf = '';
    if (!state.urole.name.f
        && ((state.urole.allow & ROLE_GENDMASK) === (ROLE_MALE | ROLE_FEMALE)
            || innategend !== flags.initgend))
        tmpbuf = `${genders[innategend].adj} `;
    let buf = '';
    if (rank_titl.toLowerCase() === role_titl.toLowerCase()) {
        /* omit role when rank title matches it */
        buf += `${an(rank_titl)}, level ${u.ulevel} ${tmpbuf}`
            + `${state.urace.noun}`;
    } else {
        buf += `${an(rank_titl)}, a level ${u.ulevel} ${tmpbuf}`
            + `${state.urace.adj} ${role_titl}`;
    }
    you_are(lines, final, buf, '');

    /* report alignment (bypass you_are() in order to omit ending period) */
    buf = ` ${You_}${!final ? are : were}${align_str(u.ualign.type)}, `
        + `${(u.ualign.type !== u.ualignbase[A_CURRENT])
            /* helm of opposite alignment (might hide conversion) */
            ? (!final ? 'currently ' : 'temporarily ')
            /* permanent conversion */
            : (u.ualign.type !== u.ualignbase[A_ORIGINAL])
                ? (!final ? 'now ' : 'belatedly ')
                /* atheist (ignored in very early game) */
                : (!u.uconduct.gnostic && state.moves > 1000)
                    ? 'nominally '
                    /* lastly, normal case */
                    : ''}`
        + `on a mission for ${u_gname(state)}`;
    enlght_out(lines, buf);
    /* show the rest of this game's pantheon (finishes previous sentence) */
    buf = ` who ${!final ? 'is' : 'was'} opposed by`;
    if (u.ualign.type !== A_LAWFUL)
        buf += ` ${align_gname(A_LAWFUL, state)} (${align_str(A_LAWFUL)}) and`;
    if (u.ualign.type !== A_NEUTRAL)
        buf += ` ${align_gname(A_NEUTRAL, state)} (${align_str(A_NEUTRAL)})`
            + `${(u.ualign.type !== A_CHAOTIC) ? ' and' : ''}`;
    if (u.ualign.type !== A_CHAOTIC)
        buf += ` ${align_gname(A_CHAOTIC, state)} (${align_str(A_CHAOTIC)})`;
    buf += '.'; /* terminate sentence */
    enlght_out(lines, buf);

    /* show original alignment, gender, race, role if any have been changed */
    const difgend = (innategend !== flags.initgend);
    let difalgn = ((u.ualign.type !== u.ualignbase[A_CURRENT]) ? 1 : 0)
        + ((u.ualignbase[A_CURRENT] !== u.ualignbase[A_ORIGINAL]) ? 2 : 0);
    if (difalgn & 1) { /* have temporary alignment so report permanent one */
        you_are(lines, final,
            `actually ${align_str(u.ualignbase[A_CURRENT])}`, '');
        difalgn &= ~1; /* suppress helm from "started out <foo>" message */
    }
    if (difgend || difalgn) { /* sex change or perm align change or both */
        enlght_out(lines, ` You started out `
            + `${difgend ? genders[flags.initgend].adj : ''}`
            + `${(difgend && difalgn) ? ' and ' : ''}`
            + `${difalgn ? align_str(u.ualignbase[A_ORIGINAL]) : ''}.`);
    }

    you_are(lines, final,
        `${body_part(HANDED, state.youmonst) === 'handed' ? '' : 'normally '}`
        + `${u.uhandedness === RIGHT_HANDED ? 'right' : 'left'}-handed`, '');

    /* dungeon level; ^X reveals more than the status line does */
    if (In_endgame(u.uz)) {
        const egdepth = depth(u.uz, state);
        const levelName = endgamelevelname(egdepth);
        buf = `in the endgame, on the `
            + `${levelName.startsWith('Plane') ? 'Elemental ' : ''}`
            + levelName;
    } else if (Is_knox_level(u.uz)) {
        /* this gives away the fact that the knox branch is only 1 level */
        buf = `on the ${state.dungeons[u.uz.dnum].dname} level`;
    } else {
        let dgnbuf = state.dungeons[u.uz.dnum].dname;
        if (dgnbuf.slice(0, 4).toLowerCase() === 'the ')
            dgnbuf = lowc(dgnbuf[0]) + dgnbuf.slice(1);
        tmpbuf = `level ${In_quest(u.uz) ? dunlev(u.uz) : depth(u.uz, state)}`;
        if (Is_rogue_level(u.uz)) tmpbuf += ', a primitive area';
        else if (Is_bigroom(u.uz) && !hasProperty(state, BLINDED))
            tmpbuf += ', a very big room';
        buf = `in ${dgnbuf}, on ${tmpbuf}`;
    }
    you_are(lines, final, buf, '');

    /* this is shown even if the 'time' option is off */
    if (state.moves === 1) {
        you_have(lines, final, 'just started your adventure', '');
    } else {
        /* same phrasing for current and final: "entered" is unconditional */
        enlght_line(lines, You_, 'entered ',
            `the dungeon ${state.moves} turn${plur(state.moves)} ago`, '');
    }

    if (midnight(state)) {
        enl_msg(lines, final, 'It ', 'is ', 'was ', 'the midnight hour', '');
    } else if (night(state)) {
        enl_msg(lines, final, 'It ', 'is ', 'was ', 'nighttime', '');
    }
    /* other environmental factors */
    if (state.flags.moonphase === FULL_MOON
        || state.flags.moonphase === NEW_MOON) {
        enl_msg(lines, final, 'There ', 'is ', 'was ',
            `a ${(state.flags.moonphase === FULL_MOON) ? 'full' : 'new'}`
            + ` moon in effect${final ? ' when your adventure ended' : ''}`,
            '');
    }
    if (state.flags.friday13) {
        // insight.c:678 chooses among three: "can happen" when !final,
        // "could have happened" for ENL_GAMEOVERALIVE, and "happened"
        // otherwise. Only the first is reachable here, so the middle arm is
        // not reproduced; restore it with end-of-game disclosure.
        enlght_out(lines, ` Bad things ${!final ? 'can happen'
            : 'happened'} on Friday the 13th.`);
    }

    /* [flags.showexp currently does not matter; should it?] */
    let experience = `${u.uexp} experience point${plur(u.uexp)}`;
    if (u.ulevel < 30 && (final || state.wizard)) {
        const nxtlvl = newuexp(u.ulevel);
        const delta = nxtlvl - u.uexp;
        experience += `, ${delta} ${u.uexp > 0 ? 'more ' : ''}`
            + `${!final ? '' : delta === 1 ? 'was ' : 'were '}`
            + `needed ${u.ulevel < 18 ? 'to attain' : 'for'} level `
            + `${u.ulevel + 1}`;
    }
    you_have(lines, final, experience, '');
    /* SCORE_ON_BOTL is not defined in the reference build, so botl_score()
       and the 'showscore' line it feeds do not exist */
}

// C ref: insight.c basics_enlightenment(). Hit points, energy points, armor
// class, gold, and autopickup.
function basics_enlightenment(final, state, lines) {
    const Power = 'energy points (spell power)';
    const { u } = state;
    const pw = u.uen;
    let hp = u.uhp;
    const pwmax = u.uenmax;
    const hpmax = u.uhpmax;

    enlght_out(lines, ''); /* separator after background */
    enlght_out(lines, 'Basics:');

    if (hp < 0) hp = 0;
    /* "1 out of 1" rather than "all" if max is only 1 */
    you_have(lines, final, (hp === hpmax && hpmax > 1)
        ? `all ${hpmax} hit points`
        : `${hp} out of ${hpmax} hit point${plur(hpmax)}`, '');

    /* low max energy is feasible, so handle couple of extra special cases */
    you_have(lines, final,
        (pwmax === 0 || (pw === pwmax && pwmax === 2)) /* both: not "all 2" */
            ? `${!pwmax ? 'no' : 'both'} ${Power}`
            : (pw === pwmax && pwmax > 2)
                ? `all ${pwmax} ${Power}`
                : `${pw} out of ${pwmax} ${Power}`, '');

    find_ac(state); /* enforces AC_MAX cap */
    let buf = `${u.uac}`;
    if (Math.abs(u.uac) === AC_MAX)
        buf += `, the ${(u.uac < 0) ? 'best' : 'worst'} possible`;
    enl_msg(lines, final, 'Your armor class ', 'is ', 'was ', buf, '');

    /* gold; includes container contents, unlike the status line */
    const umoney = money_cnt(state.invent);
    const hmoney = hidden_gold(final, state);

    buf = !umoney
        ? ` Your wallet ${!final ? 'is' : 'was'} empty`
        : ` Your wallet contain${!final ? 's' : 'ed'} ${umoney} `
            + `${currency(umoney, state)}`;
    /* terminate the wallet line if appropriate, otherwise introduce the
       continuation; output now either way */
    buf += !hmoney ? '.' : !umoney ? ', but' : ', and';
    enlght_out(lines, buf);

    /* put contained gold on its own line to avoid excessive width */
    if (hmoney) {
        enl_msg(lines, final, 'you ', 'have ', 'had ',
            `${hmoney} ${umoney ? 'more' : currency(hmoney, state)}`
            + ' stashed away in your pack', '');
    }

    if (state.flags.pickup) {
        buf = 'on';
        if (costly_spot(state.u.ux, state.u.uy, state)) {
            /* being in a shop inhibits autopickup, even 'pickup_thrown' */
            buf += ', but temporarily disabled while inside the shop';
        } else {
            // options.c optfn_pickup_types() turns the configured class
            // symbols into the class indices oc_to_str() reads.
            const ocl = oc_to_str(state.flags.pickup_types);
            buf += ` for ${ocl ? `'${ocl}'` : 'all types'}`;
            /* show when not 'all types' */
            if (state.flags.pickup_thrown && ocl) buf += ' plus thrown';
            if (state.ga?.apelist) buf += ', with exceptions';
        }
    } else {
        buf = 'off';
    }
    enl_msg(lines, final, 'Autopickup ', 'is ', 'was ', buf, '');
}

// C ref: insight.c one_characteristic().
function one_characteristic(mode, final, attrindx, state, lines) {
    let hide_innate_value = false;

    /* being polymorphed or wearing certain cursed items prevents the hero
       from reliably tracking changes to characteristics */
    // insight.c:860-866. The `else` matters: a polymorphed hero's values are
    // hidden whatever the rings do. youprop.h:385 defines Fixed_abil as the
    // extrinsic alone -- there is no HFixed_abil term -- so an intrinsic in
    // this slot leaves the macro FALSE and C prints the values normally, and
    // even the extrinsic hides nothing unless do_wear.c stuck_ring() names
    // something keeping a ring of sustain ability on.
    //
    // enlightenment() below refuses a polymorphed hero before any of this
    // runs, so the first arm cannot execute yet; it is written out for the
    // same reason the past-tense `final` arms are, which this file's header
    // gives. The Fixed_abil arm is live.
    if (Upolyd(state.u)) {
        hide_innate_value = true;
    } else if (state.u.uprops?.[FIXED_ABIL]?.extrinsic) {
        if (stuck_ring(state.uleft, RIN_SUSTAIN_ABILITY, state)
            || stuck_ring(state.uright, RIN_SUSTAIN_ABILITY, state))
            hide_innate_value = true;
    }
    switch (attrindx) {
    case A_STR:
        if (state.uarmg && state.uarmg.otyp === GAUNTLETS_OF_POWER
            && state.uarmg.cursed)
            hide_innate_value = true;
        break;
    case A_DEX:
        break;
    case A_CON:
        if (state.uwep?.oartifact === ART_OGRESMASHER && state.uwep.cursed)
            hide_innate_value = true;
        break;
    case A_INT:
    case A_WIS:
        if (state.uarmh && state.uarmh.otyp === DUNCE_CAP
            && state.uarmh.cursed)
            hide_innate_value = true;
        break;
    case A_CHA:
        break;
    default:
        return; /* impossible */
    }
    /* note: final disclosure includes MAGICENLIGHTENTMENT */
    // Neither term can decide anything yet: enlightenment() admits
    // BASICENLIGHTENMENT alone, so the mask is 0, and it refuses a polymorphed
    // hero. Both are written as insight.c:892 has them so the magic sections
    // and polyself find the statement already correct.
    if ((mode & MAGICENLIGHTENMENT) && !Upolyd(state.u))
        hide_innate_value = false;

    const acurrent = effective_attribute(state, attrindx);
    let valubuf = attrval(attrindx, acurrent);
    const subjbuf = `Your ${attrname[attrindx]} `;

    if (!hide_innate_value) {
        /* show abase, amax, and/or attrmax when any of them is interesting */
        const abase = state.u.acurr.a[attrindx];
        const apeak = state.u.amax.a[attrindx];
        const alimit = state.urace.attrmax[attrindx];
        /* criterium for whether the limit is interesting varies */
        const interesting_alimit = final
            ? true
            : (alimit !== (attrindx !== A_STR ? 18 : STR18(100)));
        let paren_pfx = final ? ' (' : ' (current; ';
        if (acurrent !== abase) {
            valubuf += `${paren_pfx}base:${attrval(attrindx, abase)}`;
            paren_pfx = ', ';
        }
        if (abase !== apeak) {
            valubuf += `${paren_pfx}peak:${attrval(attrindx, apeak)}`;
            paren_pfx = ', ';
        }
        if (interesting_alimit) {
            /* more verbose if exceeding 'limit' due to magic bonus */
            valubuf += `${paren_pfx}${(acurrent > alimit) ? 'innate ' : ''}`
                + `limit:${attrval(attrindx, alimit)}`;
        }
        if (acurrent !== abase || abase !== apeak || interesting_alimit)
            valubuf += ')';
    }
    enl_msg(lines, final, subjbuf, 'is ', 'was ', valubuf, '');
}

// C ref: insight.c characteristics_enlightenment().
function characteristics_enlightenment(mode, final, state, lines) {
    enlght_out(lines, '');
    enlght_out(lines, `${!final ? '' : 'Final '}Characteristics:`);

    /* bottom line order */
    for (const attrindx of [A_STR, A_DEX, A_CON, A_INT, A_WIS, A_CHA])
        one_characteristic(mode, final, attrindx, state, lines);
}

// C ref: insight.c weapon_insight(). What the hero wields and how skilled
// they are with it.
function weapon_insight(final, state, lines) {
    const uwep = state.uwep;

    /* report being weaponless; distinguish whether gloves are worn */
    if (!uwep) {
        you_are(lines, final, empty_handed(state), '');
    } else if (state.u.twoweap) {
        you_are(lines, final, 'wielding two weapons at once', '');
    } else {
        if (uwep.otyp === SHIELD_OF_REFLECTION)
            throw new UnsupportedEnlightenmentError('shield_simple_name()');
        // obj.h defines is_wet_towel(o) as otyp == TOWEL && spe > 0, so a dry
        // towel keeps the weapon_descr() result below. The stop above tests
        // otyp alone because insight.c:1288 does the same for the shield.
        if (uwep.otyp === TOWEL && uwep.spe > 0)
            throw new UnsupportedEnlightenmentError('is_wet_towel()');
        const what = weapon_descr(uwep, state);

        you_are(lines, final,
            (['armor', 'food', 'venom'].includes(what.toLowerCase()))
                ? `wielding some ${what}`
                /* [maybe include known blessed?] */
                : `wielding ${(uwep.quan === 1) ? an(what) : makeplural(what)}`,
            '');
    }

    /*
     * Skill with current weapon.  Might help players who've never
     * noticed #enhance or decided that it was pointless.
     */
    const wtype = weapon_type(uwep, state);
    if (wtype !== P_NONE && (!uwep || !is_ammo(uwep, state))) {
        const sklvl = P_SKILL(wtype, state);
        const hav = (sklvl !== P_UNSKILLED && sklvl !== P_SKILLED);
        const sklvlbuf = (sklvl === P_ISRESTRICTED)
            ? 'no' : lcase(skill_level_name(wtype, state));
        /* "you have no/basic/expert/master/grand-master skill with <skill>"
           or "you are unskilled/skilled in <skill>" */
        let buf = `${sklvlbuf} ${hav ? 'skill with' : 'in'} `
            + `${skill_name(wtype, state)}`;

        if (!state.u.twoweap) {
            if (can_advance(wtype, false, state))
                buf += ` and ${!final ? 'can enhance' : 'could have enhanced'}`
                    + ' that';
            if (hav) you_have(lines, final, buf, '');
            else you_are(lines, final, buf, '');
        } else { /* two-weapon */
            const also_ = 'also ';
            let pfx = '', sfx = '';
            let also = '', also2 = '', also3 = null;
            let verb_present, verb_past;
            const wtype2 = weapon_type(state.uswapwep, state);
            const sklvl2 = P_SKILL(wtype2, state);
            let twoskl = P_SKILL(P_TWO_WEAPON_COMBAT, state);
            let twobuf;
            const hav2 = (sklvl2 !== P_UNSKILLED && sklvl2 !== P_SKILLED);

            /* normally hero must have access to two-weapon skill in
               order to initiate u.twoweap, but not if polymorphed into
               a form which has multiple weapon attacks, so we need to
               avoid getting bitten by unexpected skill value */
            if (twoskl === P_ISRESTRICTED) {
                twoskl = P_UNSKILLED;
                /* restricted is the same as unskilled as far as bonus
                   or penalty goes, and it isn't ordinarily seen so
                   skill_level_name() returns "Unknown" for it */
                twobuf = 'restricted';
            } else {
                twobuf = lcase(skill_level_name(P_TWO_WEAPON_COMBAT, state));
            }

            /* keep buf from above in case skill levels match */
            if (twoskl < sklvl) {
                /* twoskil won't be restricted so sklvl is at least basic */
                pfx = `Your skill in ${skill_name(wtype, state)} `;
                sfx = ` limited by being ${twobuf} with two weapons`;
                also = also_;
            } else if (twoskl > sklvl) {
                /* sklvl might be restricted */
                pfx = 'Your two weapon skill ';
                sfx = ' limited by ';
                sfx += (sklvl > P_ISRESTRICTED)
                    ? `being ${sklvlbuf}` : 'having no skill';
                sfx += ` with ${skill_name(wtype, state)}`;
                also2 = also_;
            } else {
                buf += ' and two weapons';
                also3 = also_;
            }
            if (pfx) enl_msg(lines, final, pfx, 'is', 'was', sfx, '');
            else if (hav) you_have(lines, final, buf, '');
            else you_are(lines, final, buf, '');

            /* skip comparison between secondary and two-weapons if it is
               identical to the comparison between primary and twoweap */
            if (wtype2 !== wtype) {
                const sknambuf2 = skill_name(wtype2, state);
                const sklvlbuf2 = lcase(skill_level_name(wtype2, state));
                verb_present = 'is', verb_past = 'was';
                pfx = sfx = buf = '';
                if (twoskl < sklvl2) {
                    /* twoskil is at least unskilled, sklvl2 at least basic */
                    pfx = `Your skill in ${sknambuf2} `;
                    sfx = ` ${also}limited by being ${twobuf} with two weapons`;
                } else if (twoskl > sklvl2) {
                    /* sklvl2 might be restricted */
                    pfx = 'Your two weapon skill ';
                    sfx = ` ${also2}limited by `;
                    sfx += (sklvl2 > P_ISRESTRICTED)
                        ? `being ${sklvlbuf2}` : 'having no skill';
                    sfx += ` with ${sknambuf2}`;
                } else {
                    /* equal; two-weapon is at least unskilled, so sklvl2 is
                       too; "you [also] have basic/expert/master/grand-master
                       skill with <skill>" or "you [also] are unskilled/
                       skilled in <skill> */
                    buf = `${sklvlbuf2} ${hav2 ? 'skill with' : 'in'} `
                        + `${sknambuf2}`;
                    buf += ' and two weapons';
                    if (also3) {
                        pfx = 'You also ';
                        // C's `Snprintf(sfx, sizeof sfx, " %s", buf),
                        // buf[0] = '\0'` is one comma expression: it moves buf
                        // into sfx and empties buf so the hav2 arms below
                        // cannot fire and this line prints once.
                        sfx = ` ${buf}`;
                        buf = '';
                        verb_present = hav2 ? 'have' : 'are';
                        verb_past = hav2 ? 'had' : 'were';
                    }
                }
                if (pfx)
                    enl_msg(lines, final, pfx, verb_present, verb_past,
                        sfx, '');
                else if (hav2) you_have(lines, final, buf, '');
                else you_are(lines, final, buf, '');
            } /* wtype2 !== wtype */

            /* if training and available skill credits already allow
               #enhance for any of primary, secondary, or two-weapon,
               tell the player; avoid attempting figure out whether
               spending skill credits enhancing one might make either
               or both of the others become ineligible for enhancement */
            const a1 = can_advance(wtype, false, state);
            const a2 = (wtype2 !== wtype)
                ? can_advance(wtype2, false, state) : false;
            const ab = can_advance(P_TWO_WEAPON_COMBAT, false, state);
            if (a1 || a2 || ab) {
                const also_wik_ = ' and also with ';

                /* for just one, the conditionals yield
                   1) "skill with <that one>"; for more than one:
                   2) "skills with <primary> and also with <secondary>" or
                   3) "skills with <primary> and also with two-weapons" or
                   4) "skills with <secondary> and also with two-weapons" or
                   5) "skills with <primary>, <secondary>, and two-weapons"
                   (no 'also's or extra 'with's for case 5); when primary
                   and secondary use the same skill, only cases 1 and 3 are
                   possible because 'a2' gets forced to False above */
                sfx = ` skill${(Number(a1) + Number(a2) + Number(ab) > 1)
                    ? 's' : ''} with `
                    + `${a1 ? skill_name(wtype, state) : ''}`
                    + `${(a1 && a2 && ab) ? ', '
                        : (a1 && (a2 || ab)) ? also_wik_ : ''}`
                    + `${a2 ? skill_name(wtype2, state) : ''}`
                    + `${(a1 && a2 && ab) ? ', and '
                        : (a2 && ab) ? also_wik_ : ''}`
                    + `${ab ? 'two weapons' : ''}`;
                enl_msg(lines, final, You_, 'can enhance',
                    'could have enhanced', sfx, '');
            }
        } /* two-weapon */
    }
}

// Conditions status_enlightenment() reports one by one. A starting hero on
// D:1 carries none of them, and each one's wording needs source this slice
// does not port, so their presence stops the command instead.
//
// A row may carry its own predicate. Plain rows use hasProperty(), whose
// intrinsic-or-extrinsic answer is a superset of the macro for all of them but
// FLYING, so those stops only ever fire early. A macro that reads state outside
// u.uprops needs its own predicate, or the condition escapes the stop and the
// command prints a window C would not have printed. DEAF has one.
//
// FLYING is the exception, and it is safe only by ordering: youprop.h:253 adds
// `u.usteed && is_flyer(u.usteed->data)`, which is TRUE for a hero on a flying
// steed carrying no flying property, and the plain row would miss it. The
// u.usteed stop below runs before this loop and refuses that hero first.
// Porting the riding status means giving FLYING its own predicate at the same
// time.
const UNPORTED_STATUS_PROPERTIES = Object.freeze([
    [LEVITATION, 'the levitation status'],
    [FLYING, 'the flying status'],
    [WWALKING, 'walking_on_water()'],
    [STONED, 'the petrification status'],
    [SLIMED, 'the sliming status'],
    [STRANGLED, 'the strangulation status'],
    [SICK, 'the sickness status'],
    [VOMITING, 'the nausea status'],
    [STUNNED, 'the stunned status'],
    [CONFUSION, 'the confusion status'],
    [HALLUC, 'the hallucination status'],
    [BLINDED, 'the blindness status'],
    // youprop.h:125 defines Deaf as (HDeaf || EDeaf || u.uroleplay.deaf).
    // OPTIONS=deaf sets only the third term, which u.uprops never sees.
    [DEAF, 'the deafness status',
        (state) => hasProperty(state, DEAF)
            || Boolean(state.u.uroleplay?.deaf)],
    [WOUNDED_LEGS, 'the wounded-legs status'],
    [GLIB, 'the slippery-fingers status'],
    [FUMBLING, 'the fumbling status'],
    [HUNGER, 'the rapid-hunger status'],
]);

// C ref: insight.c status_enlightenment(). Selected obvious capabilities and
// assorted troubles; the ones a fresh hero cannot have stop instead.
function status_enlightenment(mode, final, state, lines) {
    const { u } = state;

    if (u.usteed)
        throw new UnsupportedEnlightenmentError('the riding status');
    if (u.uinwater)
        throw new UnsupportedEnlightenmentError('the in-water status');
    for (const [propidx, branch, present] of UNPORTED_STATUS_PROPERTIES) {
        if (present ? present(state) : hasProperty(state, propidx))
            throw new UnsupportedEnlightenmentError(branch);
    }
    if (state.uball)
        throw new UnsupportedEnlightenmentError('the punished status');
    if (u.utrap)
        throw new UnsupportedEnlightenmentError('trap_predicament()');
    if (u.ustuck)
        throw new UnsupportedEnlightenmentError('the held-by-monster status');
    if (state.iflags.tux_penalty)
        throw new UnsupportedEnlightenmentError("the monk's suit penalty");

    const magic = Boolean(mode & MAGICENLIGHTENMENT);

    enlght_out(lines, ''); /* separator after title or characteristics */
    enlght_out(lines, final ? 'Final Status:' : 'Status:');

    // C ref: insight.c:1181-1188. Sleepy (narcolepsy) arm: displayed when
    // the property is set and the cause is either magically known or the
    // player can see a worn item that confers it.
    if (hasProperty(state, SLEEPY)) {
        if (magic || cause_known(SLEEPY, state)) {
            let buf = attributeSource(SLEEPY, state);
            if (state.wizard)
                buf += ` (${(u.uprops[SLEEPY].intrinsic ?? 0) & TIMEOUT})`;
            enl_msg(lines, final, 'You ', 'fall', 'fell',
                ' asleep uncontrollably', buf);
        }
    }

    /* hunger/nutrition; the status line omits "not hungry" and we do not */
    let buf = mungspaces(hu_stat[u.uhs]);
    if (!buf) buf = 'not hungry';
    buf = lowc(buf[0]) + buf.slice(1); /* override capitalization */
    if (buf === 'weak') buf += ' from severe hunger';
    else if (buf.startsWith('faint')) buf += ' due to starvation';
    if (state.wizard) buf += ` <${u.uhunger}>`;
    you_are(lines, final, buf, '');

    /* encumbrance */
    const cap = near_capacity(state);
    if (cap > UNENCUMBERED) {
        buf = enc_stat[cap];
        buf = lowc(buf[0]) + buf.slice(1);
        const adj = {
            [SLT_ENCUMBER]: 'slightly', /* burdened */
            [MOD_ENCUMBER]: 'moderately', /* stressed */
            [HVY_ENCUMBER]: 'very', /* strained */
            [EXT_ENCUMBER]: 'extremely', /* overtaxed */
            [OVERLOADED]: 'not possible',
        }[cap] ?? '?_?'; /* (should always get overridden) */
        if (state.wizard) {
            // C calls inv_weight() again after near_capacity(), preserving
            // hack.c's live capacity cache and reporting the raw excess.
            buf += ` <${inv_weight(state)}>`;
        }
        buf += `; movement ${!final ? 'is' : 'was'} ${adj}`
            + `${(cap < OVERLOADED) ? ' slowed' : ''}`;
        you_are(lines, final, buf, '');
    } else {
        /* last resort entry, guarantees Status section is non-empty */
        buf = 'unencumbered';
        if (state.wizard) buf += ` <${inv_weight(state)}>`;
        you_are(lines, final, buf, '');
    }

    /* current weapon(s) and corresponding skill level(s) */
    weapon_insight(final, state, lines);

    /* report 'nudity' */
    if (!state.uarm && !state.uarmu && !state.uarmc && !state.uarms
        && !state.uarmg && !state.uarmf && !state.uarmh) {
        if (u.uroleplay.nudist)
            enl_msg(lines, final, You_, 'do', 'did', ' not wear any armor', '');
        else
            you_are(lines, final, 'not wearing any armor', '');
    }
}

// youprop.h:69 widens Sick_resistance with defended(&gy.youmonst, AD_DISE).
// mondata.c defended() answers that from a wielded artifact whose defn.adtyp is
// AD_DISE -- artilist.h holds none, so artifact.c:663 is the only AD_DISE in
// the tree -- or from worn dragon armor, where artifact.c defends() maps
// AD_DISE to green scales alone. So the extra term reduces to the worn suit.
function greenDragonSuit(state) {
    return Boolean(state.uarm
        && (state.uarm.otyp === GREEN_DRAGON_SCALES
            || state.uarm.otyp === GREEN_DRAGON_SCALE_MAIL));
}

// Every property attributes_enlightenment() reports, in the order its lines
// appear. A hero on D:1 who has just started carries none of them, and each
// line needs wording -- from_what(), enlght_combatinc(), enlght_halfdmg(),
// x_monnam(), makeplural() -- that this slice does not port, so their presence
// stops the command rather than dropping a line C would have printed.
//
// Plain rows use propertyInPlay(), which is a superset of the macro named
// beside them, so those stops only ever fire early. Two rows read state outside
// u.uprops and carry their own predicate. A third pair, Swimming and Flying,
// would need one for `u.usteed && is_swimmer/is_flyer(u.usteed->data)`, and are
// safe only by ordering: enlightenment() runs status_enlightenment() first,
// exactly as insight.c:416-421 does, and that function's u.usteed stop refuses
// a mounted hero before this table is read.
const UNPORTED_ATTRIBUTE_PROPERTIES = Object.freeze([
    [INVULNERABLE, 'Invulnerable'],
    [FIRE_RES, 'Fire_resistance'],
    [COLD_RES, 'Cold_resistance'],
    [SLEEP_RES, 'Sleep_resistance'],
    [DISINT_RES, 'Disint_resistance'],
    [SHOCK_RES, 'Shock_resistance'],
    [ACID_RES, 'Acid_resistance'],
    [DRAIN_RES, 'Drain_resistance'],
    [SICK_RES, 'Sick_resistance',
        (state) => propertyInPlay(state, SICK_RES) || greenDragonSuit(state)],
    [STONE_RES, 'Stone_resistance'],
    [HALLUC_RES, 'Halluc_resistance'],
    [BLINDED, 'the Eyes of the Overworld and blind See_invisible arms'],
    [BLND_RES, 'Blnd_resist'],
    [SEE_INVIS, 'See_invisible'],
    [TELEPAT, 'Blind_telepat'],
    [WARNING, 'Warning'],
    [WARN_OF_MON, 'Warn_of_mon'],
    [WARN_UNDEAD, 'Undead_warning'],
    [SEARCHING, 'Searching'],
    [CLAIRVOYANT, 'Clairvoyant'],
    [INFRAVISION, 'Infravision'],
    [DETECT_MONSTERS, 'Detect_monsters'],
    [ADORNED, 'Adornment'],
    [INVIS, 'Invisible'],
    [DISPLACED, 'Displaced'],
    // Poison resistance, stealth, and speed have source-backed output below.
    [AGGRAVATE_MONSTER, 'Aggravate_monster'],
    [CONFLICT, 'Conflict'],
    [JUMPING, 'Jumping'],
    [TELEPORT, 'Teleportation'],
    [TELEPORT_CONTROL, 'Teleport_control'],
    [LEVITATION, 'BLevitation'],
    [FLYING, 'BFlying'],
    [WWALKING, 'Wwalking'],
    [SWIMMING, 'Swimming'],
    // youprop.h:275-281 defines Breathless and Amphibious with a permonst
    // term, so a form that needs no air escapes a u.uprops-only stop.
    [MAGICAL_BREATHING, 'Breathless and Amphibious',
        (state) => propertyInPlay(state, MAGICAL_BREATHING)
            || breathless(state.youmonst?.data)
            || amphibious(state.youmonst?.data)],
    [PASSES_WALLS, 'Passes_walls'],
    [REGENERATION, 'Regeneration'],
    [SLOW_DIGESTION, 'Slow_digestion'],
    [PROTECTION, 'Protection'],
    [HALF_PHDAM, 'Half_physical_damage'],
    [HALF_SPDAM, 'Half_spell_damage'],
    [PROT_FROM_SHAPE_CHANGERS, 'Protection_from_shape_changers'],
    [UNCHANGING, 'Unchanging'],
    [POLYMORPH, 'Polymorph'],
    [POLYMORPH_CONTROL, 'Polymorph_control'],

    [REFLECTING, 'Reflecting'],
    [FREE_ACTION, 'Free_action'],
    [FIXED_ABIL, 'Fixed_abil'],
    [LIFESAVED, 'Lifesaved'],
]);

// C ref: insight.c attributes_enlightenment() (1487-2005), "intrinsics and the
// like, other non-obvious capabilities". C's `mode` parameter is UNUSED, so
// this port drops it as background_enlightenment() does.
//
// The debug in-progress lines and the ordinary lines already covered here
// are:
//
//   the piousness() line          insight.c:1509-1513
//   the numeric alignment line    insight.c:1515-1518
//   the magic-cancellation line   insight.c:1800-1808
//   the numeric luck lines        insight.c:1909-1918
//   the can_pray() line           insight.c:1949-1953, the !u.ugangr arm.
//                                 C's :1946 spelling of the same Sprintf is
//                                 inside `#if 0`, so :1949 is the live one
//
// Remaining unported lines stop by name, either through the property table
// above or through one of the guards below. The polymorphed region, insight.c:1858-1893,
// is refused further up by enlightenment(). The `#ifdef DEBUG` named-fruit
// block at insight.c:1955 is not compiled into the recorder --
// nethack-c/recorder/include/config.h defines DEBUG_MIGRATING_MONS and no bare
// DEBUG -- so it has no branch to refuse.
async function attributes_enlightenment(final, state, lines) {
    const { u } = state;

    const finalDeadProperties = final === ENL_GAMEOVERDEAD
        ? new Set([INFRAVISION]) : null;
    for (const [propidx, branch, present] of UNPORTED_ATTRIBUTE_PROPERTIES) {
        if (finalDeadProperties?.has(propidx)) continue;
        if (present ? present(state) : propertyInPlay(state, propidx))
            throw new UnsupportedEnlightenmentError(branch);
    }
    if (u.uevent?.uhand_of_elbereth)
        throw new UnsupportedEnlightenmentError('the hofe_titles[] line');
    // insight.c's five item_resistance_message() calls read
    // zap.c u_adtyp_resistance_obj(), whose 99% arm needs an extrinsic the
    // matching resistance row above already refuses. Its 90% arm needs only a
    // worn dwarvish cloak, and nothing else in this function notices one.
    if (state.uarmc?.otyp === DWARVISH_CLOAK)
        throw new UnsupportedEnlightenmentError('item_resistance_message()');
    if (u.uedibility)
        throw new UnsupportedEnlightenmentError('the detrimental-food line');
    if (u.umconf)
        throw new UnsupportedEnlightenmentError('the confuse-monsters line');
    if (is_clinger(state.youmonst?.data))
        throw new UnsupportedEnlightenmentError('the ceiling-clinging lines');
    if (u.uhitinc || u.udaminc || u.uspellprot)
        throw new UnsupportedEnlightenmentError('enlght_combatinc()');
    // youprop.h:407 Half_gas_damage, the only property here with no u.uprops
    // slot at all.
    if (state.ublindf?.otyp === TOWEL && state.ublindf.spe > 0)
        throw new UnsupportedEnlightenmentError('the poison-gas line');
    // insight.c:1815-1830 enters on knowing any spell but prints only when
    // cast_adj is non-empty, so both terms belong to the stop.
    if (spellid(0, state) > NO_SPELL
        && ((state.uarm && isMetallic(state.uarm, state))
            || state.uarmc?.otyp === ROBE))
        throw new UnsupportedEnlightenmentError('the spell-casting line');
    if (lays_eggs(state.youmonst?.data) && state.flags.female)
        throw new UnsupportedEnlightenmentError('the lay-eggs line');
    if (ismnum(u.ulycn))
        throw new UnsupportedEnlightenmentError('the werecreature line');
    /* youprop.h:404 Hate_silver */
    if (u.ulycn >= LOW_PM || hates_silver(state.youmonst?.data))
        throw new UnsupportedEnlightenmentError('the harmed-by-silver line');
    /* you.h:464 `#define Luck (u.uluck + u.moreluck)` */
    const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
    if (luck && final !== ENL_GAMEOVERDEAD && !state.wizard)
        throw new UnsupportedEnlightenmentError('the luck lines');
    // insight.c:1926 asks `carrying(LUCKSTONE) || stone_luck(TRUE)`.
    // artifact.c confers_luck() answers TRUE for a luckstone and for every
    // artifact stone_luck() counts, so scanning it refuses wherever either C
    // term holds and never later.
    for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
        if (confers_luck(otmp, state) && final !== ENL_GAMEOVERDEAD) {
            throw new UnsupportedEnlightenmentError(
                'the luck-does-not-time-out lines',
            );
        }
    }
    if (u.ugangr)
        throw new UnsupportedEnlightenmentError('the angry-god line');
    // insight.c:1975-1997 leaves `p` NULL only while the game is in progress;
    // final dead disclosure instead prints the death state below.
    if (u.umortality && final !== ENL_GAMEOVERDEAD)
        throw new UnsupportedEnlightenmentError('the have-been-killed line');

    /*\
     *  Attributes
    \*/
    enlght_out(lines, '');
    enlght_out(lines, final ? 'Final Attributes:' : 'Attributes:');

    let buf = piousness(true, 'aligned', state);
    if (u.ualign.record >= 0)
        you_are(lines, final, buf, '');
    else
        you_have(lines, final, buf, '');

    if (state.wizard) {
        enl_msg(lines, final, 'Your alignment ', 'is', 'was',
            ` ${u.ualign.record}`, '');
    }

    if (hasProperty(state, ANTIMAGIC)) {
        // insight.c from_what() identifies the Wizard's worn cloak in this
        // reachable debug case. Other callers retain the ordinary wording.
        const source = state.wizard
            && state.uarmc?.otyp === CLOAK_OF_MAGIC_RESISTANCE
            ? ` because of ${ysimple_name(state.uarmc, state)}` : '';
        you_are(lines, final, `magic-protected${source}`, '');
    }

    if (hasProperty(state, POISON_RES))
        you_are(lines, final, 'poison resistant',
            attributeSource(POISON_RES, state));

    if (hasProperty(state, INFRAVISION))
        you_have(lines, final, 'infravision', '');

    if (hasProperty(state, STEALTH))
        you_are(lines, final, 'stealthy',
            attributeSource(STEALTH, state));

    let armpro = magic_negation(state.youmonst, state);
    if (armpro > 0) {
        /* magic cancellation factor, conferred by worn armor */
        const mc_types = ['' /*ordinary*/, 'warded', 'guarded', 'protected'];
        /* sanity check */
        if (armpro >= mc_types.length)
            armpro = mc_types.length - 1;
        you_are(lines, final, mc_types[armpro], '');
    }

    if (hasProperty(state, FAST))
        you_are(lines, final, 'fast', attributeSource(FAST, state));

    if (luck) {
        const prefix = Math.abs(luck) >= 10 ? 'extremely '
            : Math.abs(luck) >= 5 ? 'very ' : '';
        const suffix = state.wizard ? ` (${luck})` : '';
        you_are(lines, final,
            `${prefix}${luck < 0 ? 'un' : ''}lucky${suffix}`, '');
    } else if (state.wizard) {
        enl_msg(lines, final, 'Your luck ', 'is', 'was', ' zero', '');
    }

    // C ref: insight.c:1919-1928. The permanent luck adjustment and the
    // luckstone timeout message are separate from the aggregate Luck line.
    // The carrying() term deliberately keeps an uncursed carried luckstone in
    // this branch even though stone_luck(FALSE) returns zero; C emits both
    // messages for that exact zero case.
    if (u.moreluck > 0)
        you_have(lines, final, 'extra luck', '');
    else if (u.moreluck < 0)
        you_have(lines, final, 'reduced luck', '');
    if (carrying(LUCKSTONE, state) || stone_luck(true, state)) {
        const timedLuck = stone_luck(false, state);
        if (timedLuck <= 0)
            enl_msg(lines, final, 'Bad luck ', 'does', 'did',
                ' not time out for you', '');
        if (timedLuck >= 0)
            enl_msg(lines, final, 'Good luck ', 'does', 'did',
                ' not time out for you', '');
    }

    if (final === ENL_GAMEOVERDEAD)
        enl_msg(lines, final, You_, 'have been killed ', 'are dead', '', '');

    /*
     * We need to suppress this when the game is over, because death
     * can change the value calculated by can_pray(), potentially
     * resulting in a false claim that you could have prayed safely.
     */
    if (!final) {
        buf = `${await can_pray(false, state) ? '' : 'not '}safely pray`;
        if (state.wizard) buf += ` (${u.ublesscnt})`;
        you_can(lines, final, buf, '');
    }
}

// C ref: insight.c enlightenment(). Builds the whole window's lines. C
// creates the menu window first and destroys it last; this port opens no
// window until the list is complete, so an unported branch leaves the screen
// untouched.
export async function enlightenment(mode, final, state = game) {
    if (final !== ENL_GAMEINPROGRESS && final !== ENL_GAMEOVERDEAD)
        throw new UnsupportedEnlightenmentError('end-of-game disclosure');
    if (Upolyd(state.u))
        throw new UnsupportedEnlightenmentError('a polymorphed hero');

    const lines = [];
    const tmpbuf = highc(state.plname[0]) + state.plname.slice(1);
    /* title: "Conan the Archeologist's attributes:" */
    enlght_out(lines, `${tmpbuf} the ${(state.flags.female
        && state.urole.name.f) ? state.urole.name.f
        : state.urole.name.m}'s attributes:`);

    /* background and characteristics; ^X or end-of-game disclosure */
    if (mode & BASICENLIGHTENMENT) {
        /* role, race, alignment, deities, dungeon level, time, experience */
        background_enlightenment(final, state, lines);
        /* hit points, energy points, armor class, gold */
        basics_enlightenment(final, state, lines);
        /* strength, dexterity, &c */
        characteristics_enlightenment(mode, final, state, lines);
    }
    /* expanded status line information, including things which aren't
       included there due to space considerations;
       shown for both basic and magic enlightenment */
    status_enlightenment(mode, final, state, lines);
    /* remaining attributes; shown for potion,&c or wizard mode and
       explore mode ^X or end of game disclosure */
    if (mode & MAGICENLIGHTENMENT) {
        /* intrinsics and other traditional enlightenment feedback */
        await attributes_enlightenment(final, state, lines);
    }

    enlght_out(lines, ''); /* separator */
    enlght_out(lines, 'Miscellaneous:');
    /* reminder to player and/or information for dumplog */
    // C's `(wizard || discover || final)` controls this reminder. The
    // in-progress debug arm is part of this slice alongside explore mode.
    if ((mode & BASICENLIGHTENMENT) !== 0
        && (state.wizard || state.discover || final)) {
        if (state.wizard || state.discover)
            you_are(lines, final, state.wizard
                ? 'running in debug mode' : 'running in explore mode', '');
        if (!state.flags.bones) {
            /* mention not saving bones iff hero just died */
            you_have_X(lines, final, 'disabled loading'
                + `${final === ENL_GAMEOVERDEAD ? ' and storing' : ''}`
                + ' of bones levels');
        } else if (!state.u.uroleplay.numbones) {
            enl_msg(lines, final, You_, "haven't encountered",
                "didn't encounter", ' any bones levels', '');
        } else {
            const count = state.u.uroleplay.numbones;
            you_have_X(lines, final,
                `encountered ${count} bones level${plur(count)}`);
        }
    }
    enl_msg(lines, final, 'Total elapsed playing time ', 'is', 'was',
        fmt_elapsed_time(final, state), '');
    return lines;
}

// C ref: insight.c record_achievement(). exper.c pluslvl() is the only caller
// this port reaches, and it always passes a rank achievement.
//
// Appending to u.uachieved[] is the whole reachable body. Three of C's other
// effects have no owner here and reach nothing observable:
//
//   SoundAchievement()   the optional sound interface
//   livelog_printf()     a file this port cannot write, the treatment
//                        recorded at js/do.js:658-660. Its three arms are the
//                        only readers of botl.c rank_to_xlev(), of
//                        achieve_msg[] and of the `program_state.gameover`
//                        early return, so none of those has a consumer either
//   impossible()         a corrupt achievement index, which pluslvl() cannot
//                        produce because xlev_to_rank() answers 1..8 for
//                        every level it reaches. The range test below throws
//                        rather than warning, so a wrong index cannot be
//                        recorded silently
export function record_achievement(achidx, state = game) {
    const u = state.u;
    const absidx = Math.abs(achidx);

    /* valid achievements range from 1 to N_ACH-1; however, ranks can be
       stored as the complement (ie, negative) to track gender */
    if ((achidx < 1 && (absidx < ACH_RNK1 || absidx > ACH_RNK8))
        || achidx >= N_ACH) {
        throw new RangeError(`Achievement #${achidx} is out of range.`);
    }

    /* the list has an extra slot so there is always at least one 0 at its
       end; find the first empty slot or achievement #achidx */
    let i = 0;
    let repeat_achievement = false;
    for (; u.uachieved[i]; ++i) {
        if (Math.abs(u.uachieved[i]) === absidx) {
            repeat_achievement = true;
            break;
        }
    }

    if (repeat_achievement)
        return; /* already recorded, don't duplicate it */
    u.uachieved[i] = achidx;
}

// C ref: insight.c achieve_rank(). The complement encodes a female hero so
// that a later report can name the gender-specific rank title.
export function achieve_rank(rank, state = game) {
    const achidx = (rank - 1) + ACH_RNK1;
    return state.flags.female ? -achidx : achidx;
}

// Conditions ustatusline() names in the trailing `info` clause of its report.
// A hero who has just started carries none of them, and each one's wording
// needs source no ported caller reaches -- makeplural(body_part(LEG)),
// fingers_or_gloves(), a_monnam() and the `, cover`/`ed by sticky goop` split
// -- so their presence stops the command rather than dropping the clause.
//
// The rows follow C's order inside ustatusline(), because C builds `info` by
// appending in that order and a hero carrying two of them would need both
// fragments in that sequence. Plain rows use hasProperty(), whose
// intrinsic-or-extrinsic answer is a superset of every macro listed here:
// youprop.h defines Sick, Stoned, Slimed, Strangled, Vomiting, Confusion,
// Glib and Stunned as the intrinsic alone, Wounded_legs and Fast as the pair,
// and Blind and Invis as the pair minus a blocking term. So each stop can only
// fire early, never late.
const UNPORTED_USTATUS_CONDITIONS = Object.freeze([
    [SICK, 'the dying-from-illness clause'],
    [STONED, 'the solidifying clause'],
    [SLIMED, 'the becoming-slimy clause'],
    [STRANGLED, 'the being-strangled clause'],
    [VOMITING, 'the nauseated clause'],
    [CONFUSION, 'the confused clause'],
    [BLINDED, 'the blind clause'],
    [STUNNED, 'the stunned clause'],
    [WOUNDED_LEGS, 'the injured-leg clause'],
    [GLIB, 'fingers_or_gloves()'],
    [FAST, 'the fast clause'],
    [INVIS, 'the invisible clause'],
]);

// C ref: insight.c mstatusline() (3273-3398), the one-line report a
// stethoscope or a wand of probing produces for a monster.
//
// C builds `info` by appending in source order and interpolates the finished
// string after the armor class, so a monster carrying two conditions needs
// both fragments in that sequence. Every fragment whose wording is a literal
// is ported. The three that need source this port does not have stop instead,
// each from C's own position in the sequence, so a monster carrying one stops
// where C would have appended it rather than printing a line short a clause:
//
//   the long-worm segment count   worm.c count_wsegs() and wseg_at()
//   the u.ustuck clause           digests(), enfolds() and sticks()
//   the u.usteed clause           Wounded_legs and EWounded_legs
//
// That split follows ustatusline() above, whose UNPORTED_USTATUS_CONDITIONS
// rows are the clauses needing unported wording rather than every clause.
//
// The tame arm's wizard-mode detail is not a debugging aside that can be
// dropped: playmode:debug sets `wizard`, and a listen at a pet in a debug game
// prints the pet's tameness, hungrytime and apport as part of the line.
export async function mstatusline(mtmp, state = game) {
    const alignment = mon_aligntyp(mtmp);
    let info = '';

    if (mtmp.mtame) {
        info += ', tame';
        if (state.wizard) {
            info += ` (${mtmp.mtame}`;
            if (!mtmp.isminion) {
                const edog = EDOG(mtmp);
                info += `; hungry ${edog.hungrytime}; apport ${edog.apport}`;
            }
            info += ')';
        }
    } else if (mtmp.mpeaceful) {
        info += ', peaceful';
    }

    if (mtmp.data === state.mons[PM_LONG_WORM]) {
        throw new UnsupportedEnlightenmentError(
            "mstatusline()'s long-worm segment count",
        );
    }
    /* don't reveal the innate form (chameleon, vampire, &c),
       just expose the fact that this current form isn't it */
    if (ismnum(mtmp.cham) && mtmp.data !== state.mons[mtmp.cham])
        info += ', shapechanger';
    /* pets eating mimic corpses mimic while eating, so this comes first */
    if (mtmp.meating)
        info += ', eating';
    // insight.c:3316-3318. C's comment above it covers the mimic alone, and
    // the stethoscope does clear that disguise before getting here; but the
    // disjunct has three terms and two of them survive a listen. A mimic whose
    // mappearance is STRANGE_OBJECT never reaches seemimic() at all, because
    // apply.c:404 tests `mtmp->mappearance` and otyp 0 is false; and a visible
    // gas cloud over the target square is not something seemimic() touches.
    // So this is named after the function it needs rather than after either
    // term. C reads m_ap_type unmasked, which M_AP_F_DKNOWN can raise on its
    // own, so the port reads it unmasked too.
    if (mtmp.mundetected || mtmp.m_ap_type
        || visible_region_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state)) {
        info += mhidden_description(mtmp, state, {
            showAlternateMonster: true,
        });
    }
    if (mtmp.mcan)
        info += ', cancelled';
    if (mtmp.mconf)
        info += ', confused';
    if (mtmp.mblinded || !mtmp.mcansee)
        info += ', blind';
    if (mtmp.mstun)
        info += ', stunned';
    if (mtmp.msleeping)
        info += ', asleep';
    // C's #if 0 above this arm explains the wording: mfrozen also covers
    // temporary sleep and being busy, so it cannot say "paralyzed".
    else if (mtmp.mfrozen || !mtmp.mcanmove)
        info += ", can't move";
    /* [arbitrary reason why it isn't moving] */
    else if ((mtmp.mstrategy & STRAT_WAITMASK) !== 0)
        info += ', meditating';
    if (mtmp.mflee)
        info += ', scared';
    if (mtmp.mtrapped)
        info += ', trapped';
    if (mtmp.mspeed) {
        info += mtmp.mspeed === MFAST ? ', fast'
            : mtmp.mspeed === MSLOW ? ', slow'
                : ', [? speed]';
    }
    if (mtmp.minvis)
        info += ', invisible';
    if (mtmp === state.u.ustuck) {
        throw new UnsupportedEnlightenmentError(
            "mstatusline()'s u.ustuck clause",
        );
    }
    if (mtmp === state.u.usteed) {
        throw new UnsupportedEnlightenmentError(
            "mstatusline()'s u.usteed clause",
        );
    }
    if (mtmp.mleashed)
        info += ', leashed';

    /* avoid "Status of the invisible newt ..., invisible" */
    /* and unlike a normal mon_nam, use "saddled" even if it has a name */
    const monnambuf = x_monnam(mtmp, ARTICLE_YOUR, null,
                               SUPPRESS_IT | SUPPRESS_INVISIBLE, false, state);

    await ttyPline(
        `Status of ${monnambuf} (${align_str(alignment)}, `
        + `${size_str(mtmp.data.msize)}):  Level ${mtmp.m_lev}  `
        + `HP ${mtmp.mhp}(${mtmp.mhpmax})  AC ${find_mac(mtmp, state)}`
        + `${info}.`,
        state,
    );
}

// C ref: insight.c ustatusline() (3401-3489), the one-line report a
// stethoscope or a probe applied to the hero produces. Every writer of C's
// `info` buffer stops above, so the buffer is provably empty where C's format
// string interpolates it and the report ends at the armor class.
export async function ustatusline(state = game) {
    const u = state.u;

    for (const [propidx, branch] of UNPORTED_USTATUS_CONDITIONS) {
        if (hasProperty(state, propidx))
            throw new UnsupportedEnlightenmentError(branch);
    }
    if (u.utrap)
        throw new UnsupportedEnlightenmentError('the trapped clause');
    if (u.uundetected)
        throw new UnsupportedEnlightenmentError('the concealed clause');
    if ((state.youmonst?.m_ap_type ?? M_AP_NOTHING) !== M_AP_NOTHING)
        throw new UnsupportedEnlightenmentError('the disguised clause');
    // u.ustuck covers C's swallowed, held and holding arms, and with it the
    // u.uswallow guard on the region clause below: youprop.h keeps u.uswallow
    // inside u.ustuck, so a hero with no holder is a hero who is not swallowed.
    if (u.ustuck)
        throw new UnsupportedEnlightenmentError('a_monnam() for u.ustuck');
    // `info` is empty at this point, so C's `strlen(info) < sizeof info` term
    // holds and the clause depends only on there being a visible region.
    if (visible_region_at(u.ux, u.uy, state))
        throw new UnsupportedEnlightenmentError('the cloud-of-vapor clause');

    await ttyPline(
        `Status of ${state.plname} `
        + `(${piousness(false, align_str(u.ualign.type), state)}):  `
        + `Level ${Upolyd(u) ? state.mons[u.umonnum].mlevel : u.ulevel}  `
        + `HP ${Upolyd(u) ? u.mh : u.uhp}(${Upolyd(u) ? u.mhmax : u.uhpmax})  `
        + `AC ${u.uac}.`,
        state,
    );
}

// C ref: insight.c doattributes(), bound to `^X`. Returns whether the command
// took game time, which for this one is never.
export async function doattributes(state = game, { menu } = {}) {
    if (typeof menu !== 'function')
        throw new TypeError('doattributes needs a menu owner');
    const lines = await enlightenment(
        BASICENLIGHTENMENT
            | ((state.wizard || state.discover) ? MAGICENLIGHTENMENT : 0),
        ENL_GAMEINPROGRESS,
        state,
    );
    await menu(lines, state);
    return false;
}
