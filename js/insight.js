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
// attributes_enlightenment() follows the complete source function, including
// ordinary and wizard-only lines. Unported callees whose return values are
// discarded remain explicit gaps in their owning modules.
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
    ACH_AMUL,
    ACH_ASTR,
    ACH_BELL,
    ACH_BGRM,
    ACH_BOOK,
    ACH_CNDL,
    ACH_ENDG,
    ACH_HELL,
    ACH_INVK,
    ACH_MEDU,
    ACH_MINE,
    ACH_MINE_PRIZE,
    ACH_NOVL,
    ACH_ORCL,
    ACH_SOKO,
    ACH_SOKO_PRIZE,
    ACH_SHOP,
    ACH_TOWN,
    ACH_TMPL,
    ACH_TUNE,
    ACH_UWIN,
    BUFSZ,
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
    ECMD_OK,
    ENL_GAMEINPROGRESS,
    ENL_GAMEOVERDEAD,
    EXT_ENCUMBER,
    FEMALE,
    FAST,
    FIRE_RES,
    FIXED_ABIL,
    FROMOUTSIDE,
    FLYING,
    FREE_ACTION,
    FULL_MOON,
    FUMBLING,
    G_GENOD,
    GLIB,
    HALF_PHDAM,
    HALF_SPDAM,
    HALLUC,
    HALLUC_RES,
    HANDED,
    HUNGER,
    HVY_ENCUMBER,
    I_SPECIAL,
    INTRINSIC,
    In_endgame,
    In_quest,
    Is_waterlevel,
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
    LL_ACHIEVE,
    LL_ARTIFACT,
    LL_DIVINEGIFT,
    LL_DUMP,
    LL_GENOCIDE,
    LL_LIFESAVE,
    LL_MINORAC,
    LL_SPOILER,
    LL_UMONST,
    LL_WISH,
    LOW_PM,
    M_AP_NOTHING,
    MALE,
    MAGICAL_BREATHING,
    MAGICENLIGHTENMENT,
    MFAST,
    MOD_ENCUMBER,
    MSLOW,
    N_ACH,
    NEUTRAL,
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
import { acurr, from_what, stone_luck } from './attrib.js';
import { getnow, midnight, night } from './calendar.js';
import { enc_stat, rank_of } from './display.js';
import { depth, dunlev, endgamelevelname } from './dungeon.js';
import { hu_stat, temp_resist } from './eat.js';
import { game } from './gstate.js';
import { newuexp } from './exper.js';
import { inv_weight, near_capacity } from './hack.js';
import {
    lcase, lowc, highc, mungspaces, ordin, strsubst, truncateByteString,
} from './hacklib.js';
import { carrying, currency, money_cnt } from './invent.js';
import { makeplural } from './fruit.js';
import { an } from './objnam.js';
import { oc_to_str } from './options.js';
import {
    DUNCE_CAP,
    GAUNTLETS_OF_POWER,
    GREEN_DRAGON_SCALE_MAIL,
    GREEN_DRAGON_SCALES,
    AMULET_OF_GUARDING,
    LUCKSTONE,
    RIN_ADORNMENT,
    RIN_PROTECTION,
    RIN_SUSTAIN_ABILITY,
    ROBE,
    SHIELD_OF_REFLECTION,
    TOWEL,
    OBJ_NAME,
} from './objects.js';
import { stuck_ring } from './do_wear.js';
import { magic_negation } from './mhitu.js';
import {
    amphibious,
    breathless,
    hates_silver,
    is_clinger,
    is_flyer,
    is_swimmer,
    is_vampire,
    is_vampshifter,
    lays_eggs,
} from './mondata.js';
import {
    AD_ACID,
    AD_COLD,
    AD_DISN,
    AD_ELEC,
    AD_FIRE,
    M2_DEMON,
    M2_ELF,
    M2_HUMAN,
    M2_ORC,
    MZ_GIGANTIC,
    MZ_HUGE,
    MZ_LARGE,
    MZ_MEDIUM,
    MZ_SMALL,
    MZ_TINY,
    PM_LONG_WORM,
    PM_GREEN_SLIME,
    PM_HIGH_CLERIC,
    G_UNIQ,
} from './monsters.js';
import { pmname, x_monnam } from './do_name.js';
import { mon_aligntyp } from './priest.js';
import { align_gname, can_pray, u_gname } from './pray.js';
import { spellid } from './spell.js';
import { is_ammo, isMetallic, is_wet_towel, objectType } from './obj.js';
import { body_part, udeadinside, ugenocided } from './polyself.js';
import { visible_region_at } from './region.js';
import { mhidden_description } from './startup_a11y.js';
import {
    displayTtyMenuTextWindow,
    displayTtyTextWindow,
} from './tty_menu.js';
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
import { livelog_printf } from './pline.js';
import { note_unported } from './unported.js';
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
import { is_pool_or_lava } from './trap.js';
import { item_what, u_adtyp_resistance_obj } from './zap.js';

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
const have_been = 'have been ';
const have_never = 'have never ';
const never = 'never ';

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

// C ref: insight.c's conduct-only sentence macros. They share the same
// tense/contraction handling as the enlightenment lines above.
function you_have_been(lines, final, goodthing) {
    enl_msg(lines, final, You_, have_been, were, goodthing, '');
}

function you_have_never(lines, final, badthing) {
    enl_msg(lines, final, You_, have_never, never, badthing, '');
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

// C ref: insight.c N_times() (362-374). The helper is local to the insight
// source unit and preserves the explicit zero-count numeric form.
export function N_times(n) {
    switch (n) {
    case 1: return 'once';
    case 2: return 'twice';
    case 3: return 'thrice';
    default: return `${n} times`;
    }
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

    const acurrent = acurr(state, attrindx);
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

    /* not a traditional status but inherently obvious to player; more
       detail given below (attributes section) for magic enlightenment */
    if (Upolyd(u)) {
        let buf = 'transformed';
        if (ugenocided(state))
            buf += ` and ${final ? 'felt' : 'feel'} ${udeadinside(state)} inside`;
        you_are(lines, final, buf, '');
    }
    // C ref: insight.c:1181-1188. Sleepy (narcolepsy) arm: displayed when
    // the property is set and the cause is either magically known or the
    // player can see a worn item that confers it.
    if (hasProperty(state, SLEEPY)) {
        if (magic || cause_known(SLEEPY, state)) {
            let buf = from_what(SLEEPY, state);
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
// Every branch in the selected C function is represented below. Calls whose
// return values are discarded by C remain explicit note_unported gaps; values
// used to select output are read from the state rather than invented.
export async function attributes_enlightenment(final, state, lines) {
    const { u } = state;

    const prop = (index) => u.uprops?.[index] ?? {};
    const h = (index) => Number(prop(index).intrinsic ?? 0);
    const e = (index) => Number(prop(index).extrinsic ?? 0);
    const b = (index) => Number(prop(index).blocked ?? 0);
    const active = (index) => Boolean(h(index) || e(index));
    const activeUnblocked = (index) => Boolean(active(index) && !b(index));
    const blind = Boolean((h(BLINDED) || e(BLINDED)) && !b(BLINDED));
    const seeInvisible = active(SEE_INVIS);
    const invisible = activeUnblocked(INVIS) && !seeInvisible;
    const veryFast = Boolean((h(FAST) & ~INTRINSIC) || e(FAST));
    const clairvoyant = activeUnblocked(CLAIRVOYANT);
    const flying = Boolean((active(FLYING)
        || (u.usteed && is_flyer(u.usteed.data))) && !b(FLYING));
    const levitation = activeUnblocked(LEVITATION);
    const walking = activeUnblocked(WWALKING) && !Is_waterlevel(u.uz);
    const swimming = Boolean(active(SWIMMING)
        || (u.usteed && is_swimmer(u.usteed.data)));
    const breathlessHero = activeUnblocked(MAGICAL_BREATHING)
        || breathless(state.youmonst?.data);
    const amphibiousHero = breathlessHero
        || amphibious(state.youmonst?.data);
    const walking_on_water = !u.uinwater && !levitation && !flying
        && walking && is_pool_or_lava(u.ux, u.uy, state);
    const luck = (u.uluck ?? 0) + (u.moreluck ?? 0);
    // C ref: insight.c item_resistance_message() (1468-1481).
    const item_resistance_message = (adtyp, message) => {
        const protection = u_adtyp_resistance_obj(adtyp, state);
        if (!protection) return;
        const somewhat = protection < 99;
        enl_msg(lines, final, 'Your items ',
            somewhat ? 'are somewhat' : 'are',
            somewhat ? 'were somewhat' : 'were', message,
            item_what(adtyp, state));
    };
    // C ref: insight.c enlght_combatinc() (160-199).
    const enlght_combatinc = (type, amount) => {
        let magnitude = Math.abs(amount);
        if (type === 'defense') magnitude = Math.trunc(magnitude * 2 / 3);
        const modifier = amount === 0 ? 'no'
            : magnitude <= 3 ? 'a small'
                : magnitude <= 6 ? 'a moderate'
                    : magnitude <= 12 ? 'a large' : 'a huge';
        const bonus = amount >= 0 ? 'bonus' : 'penalty';
        const text = type === 'to hit'
            ? `${modifier} ${bonus} ${type}`
            : `${modifier} ${type} ${bonus}`;
        return `${text}${final || state.wizard
            ? ` (${amount > 0 ? '+' : ''}${amount})` : ''}`;
    };
    // C ref: insight.c enlght_halfdmg() (201-222).
    const enlght_halfdmg = (category) => {
        const name = category === HALF_PHDAM ? 'physical'
            : category === HALF_SPDAM ? 'spell' : 'unknown';
        return `${final || state.wizard ? 'half' : 'reduced'} ${name} damage`;
    };

    /*\
     *  Attributes
    \*/
    enlght_out(lines, '');
    enlght_out(lines, final ? 'Final Attributes:' : 'Attributes:');

    if (u.uevent?.uhand_of_elbereth) {
        const titles = [
            'the Hand of Elbereth',
            'the Envoy of Balance',
            'the Glory of Arioch',
        ];
        you_are(lines, final,
            titles[(u.uevent.uhand_of_elbereth ?? 1) - 1] ?? titles[0], '');
    }
    let buf = piousness(true, 'aligned', state);
    if (u.ualign.record >= 0)
        you_are(lines, final, buf, '');
    else
        you_have(lines, final, buf, '');

    if (state.wizard) {
        enl_msg(lines, final, 'Your alignment ', 'is', 'was',
            ` ${u.ualign.record}`, '');
    }

    if (h(INVULNERABLE))
        you_are(lines, final, 'invulnerable', from_what(INVULNERABLE, state));
    if (hasProperty(state, ANTIMAGIC)) {
        you_are(lines, final, 'magic-protected', from_what(ANTIMAGIC, state));
    }
    if (activeUnblocked(FIRE_RES))
        you_are(lines, final, 'fire resistant', from_what(FIRE_RES, state));
    item_resistance_message(AD_FIRE, ' protected from fire');
    if (activeUnblocked(COLD_RES))
        you_are(lines, final, 'cold resistant', from_what(COLD_RES, state));
    item_resistance_message(AD_COLD, ' protected from cold');
    if (activeUnblocked(SLEEP_RES))
        you_are(lines, final, 'sleep resistant', from_what(SLEEP_RES, state));
    if (activeUnblocked(DISINT_RES))
        you_are(lines, final, 'disintegration resistant',
            from_what(DISINT_RES, state));
    item_resistance_message(AD_DISN, ' protected from disintegration');
    if (activeUnblocked(SHOCK_RES))
        you_are(lines, final, 'shock resistant', from_what(SHOCK_RES, state));
    item_resistance_message(AD_ELEC, ' protected from electric shocks');
    if (hasProperty(state, POISON_RES))
        you_are(lines, final, 'poison resistant',
            from_what(POISON_RES, state));
    if (activeUnblocked(ACID_RES)) {
        const description = `${temp_resist(ACID_RES, state) ? 'temporarily ' : ''}`
            + 'acid resistant';
        you_are(lines, final, description, from_what(ACID_RES, state));
    }
    item_resistance_message(AD_ACID, ' protected from acid');
    if (activeUnblocked(DRAIN_RES))
        you_are(lines, final, 'level-drain resistant',
            from_what(DRAIN_RES, state));
    if (activeUnblocked(SICK_RES) || greenDragonSuit(state))
        you_are(lines, final, 'immune to sickness', from_what(SICK_RES, state));
    if (activeUnblocked(STONE_RES)) {
        const description = `${temp_resist(STONE_RES, state) ? 'temporarily ' : ''}`
            + 'petrification resistant';
        you_are(lines, final, description, from_what(STONE_RES, state));
    }

    // C ref: insight.c:1559-1561. Halluc_resistance is reported with the
    // source wording supplied by attrib.c from_what() in wizard mode.
    if (hasProperty(state, HALLUC_RES))
        enl_msg(lines, final, You_, 'resist', 'resisted',
            ' hallucinations', from_what(HALLUC_RES, state));
    if (u.uedibility)
        you_can(lines, final, 'recognize detrimental food', '');

    const blockedBlind = Boolean((h(BLINDED) || e(BLINDED)) && b(BLINDED));
    if (blockedBlind && (h(BLINDED) || e(BLINDED)))
        you_can(lines, final, 'see', from_what(-BLINDED, state));
    if (activeUnblocked(BLND_RES) && !blind)
        you_are(lines, final, 'not subject to light-induced blindness',
            from_what(BLND_RES, state));
    if (seeInvisible) {
        if (!blind)
            enl_msg(lines, final, You_, 'see', 'saw', ' invisible',
                from_what(SEE_INVIS, state));
        else if (!(h(BLINDED) & FROMOUTSIDE))
            enl_msg(lines, final, You_, 'will see', 'would have seen',
                ' invisible when not blind', '');
        else
            enl_msg(lines, final, You_, 'would see', 'would have seen',
                ' invisible if not blind', '');
    }
    if (active(TELEPAT))
        you_are(lines, final, 'telepathic', from_what(TELEPAT, state));
    if (active(WARNING))
        you_are(lines, final, 'warned', from_what(WARNING, state));
    const warntype = state.context?.warntype ?? {};
    if (active(WARN_OF_MON) && warntype.obj) {
        const objectWarning = (warntype.obj & M2_ORC) ? 'orcs'
            : (warntype.obj & M2_ELF) ? 'elves'
                : (warntype.obj & M2_DEMON) ? 'demons' : 'something';
        you_are(lines, final, `aware of the presence of ${objectWarning}`,
            from_what(WARN_OF_MON, state));
    }
    if (active(WARN_OF_MON) && warntype.polyd) {
        const mask = warntype.polyd;
        const polydWarning = (mask & (M2_HUMAN | M2_ELF))
            === (M2_HUMAN | M2_ELF) ? 'humans and elves'
            : mask & M2_HUMAN ? 'humans'
                : mask & M2_ELF ? 'elves'
                    : mask & M2_ORC ? 'orcs'
                        : mask & M2_DEMON ? 'demons' : 'certain monsters';
        you_are(lines, final, `aware of the presence of ${polydWarning}`, '');
    }
    const warnedSpecies = warntype.species ?? state.mons?.[
        warntype.speciesidx];
    if (active(WARN_OF_MON) && warnedSpecies) {
        const speciesName = warnedSpecies.pmnames?.[NEUTRAL]
            ?? warnedSpecies.pmnames?.[2] ?? warnedSpecies.name ?? 'monster';
        you_are(lines, final,
            `aware of the presence of ${makeplural(speciesName)}`,
            from_what(WARN_OF_MON, state));
    }
    if (active(WARN_UNDEAD))
        you_are(lines, final, 'warned of undead', from_what(WARN_UNDEAD, state));

    // C ref: insight.c:1612-1613. Searching is an intrinsic or extrinsic
    // property, and from_what() supplies its wizard-mode source wording.
    if (hasProperty(state, SEARCHING))
        you_have(lines, final, 'automatic searching',
            from_what(SEARCHING, state));

    if (clairvoyant) {
        you_are(lines, final, 'clairvoyant', from_what(CLAIRVOYANT, state));
    } else if (b(CLAIRVOYANT) && active(CLAIRVOYANT)) {
        let source = from_what(-CLAIRVOYANT, state);
        source = strsubst(source, ' because of ', ' if not for ');
        enl_msg(lines, final, You_, 'could be', 'could have been',
            ' clairvoyant', source);
    }
    if (hasProperty(state, INFRAVISION))
        you_have(lines, final, 'infravision', from_what(INFRAVISION, state));

    if (active(DETECT_MONSTERS)) {
        let description = 'sensing the presence of monsters';
        if (state.wizard && (h(DETECT_MONSTERS) & TIMEOUT))
            description += ` (${h(DETECT_MONSTERS) & TIMEOUT})`;
        you_are(lines, final, description, '');
    }
    if (u.umconf) {
        let description = ' monsters when hitting them';
        if (state.wizard && !final)
            description += u.umconf === 1 ? ' (next hit only)'
                : ` (next ${u.umconf} hits)`;
        enl_msg(lines, final, You_, 'will confuse', 'would have confused',
            description, '');
    }

    const adorn = e(ADORNED);
    if (adorn) {
        let ringBonus = 0;
        if (state.uleft?.otyp === RIN_ADORNMENT) ringBonus += state.uleft.spe ?? 0;
        if (state.uright?.otyp === RIN_ADORNMENT)
            ringBonus += state.uright.spe ?? 0;
        you_are(lines, final,
            `${ringBonus > 0 ? 'more ' : ringBonus < 0 ? 'less ' : ''}charismatic`,
            from_what(ADORNED, state));
    }
    if (invisible)
        you_are(lines, final, 'invisible', from_what(INVIS, state));
    else if (activeUnblocked(INVIS))
        you_are(lines, final, 'invisible to others', from_what(INVIS, state));
    else if (b(INVIS) && active(INVIS))
        you_are(lines, final, 'visible', from_what(-INVIS, state));
    if (active(DISPLACED))
        you_are(lines, final, 'displaced', from_what(DISPLACED, state));
    if (activeUnblocked(STEALTH))
        you_are(lines, final, 'stealthy',
            from_what(STEALTH, state));
    else if (b(STEALTH) && active(STEALTH)) {
        const suffix = b(STEALTH) === FROMOUTSIDE ? ' if not mounted' : '';
        enl_msg(lines, final, You_, 'would be', 'would have been',
            ` stealthy${suffix}`, '');
    }
    if (active(AGGRAVATE_MONSTER))
        enl_msg(lines, final, 'You aggravate', '', 'd', ' monsters',
            from_what(AGGRAVATE_MONSTER, state));
    if (active(CONFLICT))
        enl_msg(lines, final, 'You cause', '', 'd', ' conflict',
            from_what(CONFLICT, state));

    if (active(JUMPING))
        you_can(lines, final, 'jump', from_what(JUMPING, state));
    if (active(TELEPORT))
        you_can(lines, final, 'teleport', from_what(TELEPORT, state));
    if (active(TELEPORT_CONTROL))
        you_have(lines, final, 'teleport control',
            from_what(TELEPORT_CONTROL, state));
    if (b(LEVITATION)) {
        const trapped = Boolean(b(LEVITATION) & I_SPECIAL);
        const terrain = Boolean(b(LEVITATION) & FROMOUTSIDE);
        if (active(LEVITATION)) {
            const suffix = `${trapped ? ' if not trapped' : ''}`
                + `${trapped && terrain ? ' and' : ''}`
                + `${terrain ? ' if surroundings permitted' : ''}`;
            enl_msg(lines, final, You_, 'would levitate', 'would have levitated',
                suffix, '');
        }
    }
    if (b(FLYING)) {
        if (active(FLYING) || (u.usteed && is_flyer(u.usteed.data))) {
            const suffix = levitation ? ' if you weren\'t levitating'
                : b(FLYING) === I_SPECIAL ? ' if you weren\'t trapped'
                    : b(FLYING) === FROMOUTSIDE
                        ? ' if surroundings permitted'
                        : ' if circumstances permitted';
            enl_msg(lines, final, You_, 'would fly', 'would have flown',
                suffix, '');
        }
    }
    if (is_clinger(state.youmonst?.data)) {
        const hasLid = has_ceiling(u.uz, state);
        if (hasLid && !u.uinwater)
            you_can(lines, final, 'cling to the ceiling', '');
        else {
            const suffix = ` to the ceiling if ${!hasLid ? 'there was one' : ''}`
                + `${!hasLid && u.uinwater ? ' and ' : ''}`
                + `${u.uinwater ? (u.uinwater === true
                    ? 'you weren\'t underwater' : 'you weren\'t in the water') : ''}`;
            enl_msg(lines, final, You_, 'could cling', 'could have clung',
                suffix, '');
        }
    }
    if (walking && !walking_on_water)
        you_can(lines, final, 'walk on water', from_what(WWALKING, state));
    if (swimming && (u.uinwater || !u.uinwater))
        you_can(lines, final, 'swim', from_what(SWIMMING, state));
    if (breathlessHero)
        you_can(lines, final, 'survive without air',
            from_what(MAGICAL_BREATHING, state));
    else if (amphibiousHero)
        you_can(lines, final, 'breathe water',
            from_what(MAGICAL_BREATHING, state));
    if (active(PASSES_WALLS))
        you_can(lines, final, 'walk through walls',
            from_what(PASSES_WALLS, state));

    if (active(REGENERATION))
        enl_msg(lines, final, 'You regenerate', '', 'd', '',
            from_what(REGENERATION, state));
    if (active(SLOW_DIGESTION))
        you_have(lines, final, 'slower digestion',
            from_what(SLOW_DIGESTION, state));
    if (u.uhitinc) {
        let description = enlght_combatinc('to hit', u.uhitinc);
        if (state.iflags?.tux_penalty && !Upolyd(u)) {
            const armorPenalty = state.urole?.spelarmr ?? 0;
            const partialThreshold = Math.trunc(4 * armorPenalty / 5);
            description += ` ${u.uhitinc < 0 ? 'increasing'
                : u.uhitinc < partialThreshold ? 'partly offsetting'
                    : u.uhitinc < armorPenalty ? 'nearly offsetting'
                        : 'overcoming'} your suit's penalty`;
        }
        you_have(lines, final, description, '');
    }
    if (u.udaminc)
        you_have(lines, final, enlght_combatinc('damage', u.udaminc), '');
    if (u.uspellprot || active(PROTECTION)) {
        let protection = u.uspellprot ?? 0;
        if (state.uleft?.otyp === RIN_PROTECTION)
            protection += state.uleft.spe ?? 0;
        if (state.uright?.otyp === RIN_PROTECTION)
            protection += state.uright.spe ?? 0;
        if (state.uamul?.otyp === AMULET_OF_GUARDING) protection += 2;
        if (h(PROTECTION) & INTRINSIC) protection += u.ublessed ?? 0;
        if (protection)
            you_have(lines, final, enlght_combatinc('defense', protection), '');
    }
    let armpro = magic_negation(state.youmonst, state);
    if (armpro > 0) {
        /* magic cancellation factor, conferred by worn armor */
        const mc_types = ['' /*ordinary*/, 'warded', 'guarded', 'protected'];
        /* sanity check */
        if (armpro >= mc_types.length)
            armpro = mc_types.length - 1;
        you_are(lines, final, mc_types[armpro], '');
    }

    if (active(HALF_PHDAM))
        enl_msg(lines, final, You_, 'take', 'took',
            ` ${enlght_halfdmg(HALF_PHDAM)}`, from_what(HALF_PHDAM, state));
    if (active(HALF_SPDAM))
        enl_msg(lines, final, You_, 'take', 'took',
            ` ${enlght_halfdmg(HALF_SPDAM)}`, from_what(HALF_SPDAM, state));
    if (state.ublindf && is_wet_towel(state.ublindf))
        enl_msg(lines, final, You_, 'take', 'took',
            ' reduced poison gas damage', '');
    if (spellid(0, state) > NO_SPELL) {
        let castAdj = '';
        const suit = state.uarm && isMetallic(state.uarm, state);
        const robe = state.uarmc?.otyp === ROBE;
        if (suit)
            castAdj = ` impaired by metallic armor${robe ? ', mitigated by your robe' : ''}`;
        else if (robe)
            castAdj = ' enhanced by wearing a robe';
        if (castAdj)
            enl_msg(lines, final, 'Your spell casting ', 'is', 'was', castAdj, '');
    }
    if (active(PROT_FROM_SHAPE_CHANGERS))
        you_are(lines, final, 'protected from shape changers',
            from_what(PROT_FROM_SHAPE_CHANGERS, state));
    if (active(UNCHANGING)) {
        if (!Upolyd(u))
            you_can(lines, final, 'not change from your current form',
                from_what(UNCHANGING, state));
        let periodic;
        let pastPeriodic;
        if (active(POLYMORPH)) {
            periodic = 'polymorph';
            pastPeriodic = 'have polymorphed';
        } else if (ismnum(u.ulycn)) {
            periodic = 'change shape';
            pastPeriodic = 'have changed shape';
        }
        if (periodic)
            enl_msg(lines, final, You_, `would ${periodic} periodically`,
                `would ${pastPeriodic} periodically`,
                ' if not locked into your current form', '');
    } else if (active(POLYMORPH)) {
        you_are(lines, final, 'polymorphing periodically',
            from_what(POLYMORPH, state));
    }
    if (active(POLYMORPH_CONTROL))
        you_have(lines, final, 'polymorph control',
            from_what(POLYMORPH_CONTROL, state));
    if (Upolyd(u) && u.umonnum !== u.ulycn
        && !(final === ENL_GAMEOVERDEAD && u.umonnum === PM_GREEN_SLIME
            && !active(UNCHANGING))) {
        let description;
        const currentForm = state.youmonst?.data;
        const vampireShift = is_vampshifter(state.youmonst)
            && !is_vampire(currentForm);
        if (!vampireShift) {
            description = `polymorphed into ${an(pmname(state.youmonst?.data,
                state.flags.female ? FEMALE : MALE))}`;
        } else {
            const baseForm = state.mons?.[state.youmonst.cham];
            description = `polymorphed into ${an(pmname(baseForm,
                state.flags.female ? FEMALE : MALE))} in ${pmname(
                currentForm, state.flags.female ? FEMALE : MALE)} form`;
        }
        if (state.wizard) description += ` (${u.mtimedone ?? 0})`;
        you_are(lines, final, description, '');
    }
    if (lays_eggs(state.youmonst?.data) && state.flags.female)
        you_can(lines, final, 'lay eggs', '');
    if (ismnum(u.ulycn)) {
        let description = an(pmname(state.mons?.[u.ulycn],
            state.flags.female ? FEMALE : MALE));
        if (u.umonnum === u.ulycn) {
            description += ' in beast form';
            if (state.wizard) description += ` (${u.mtimedone ?? 0})`;
        }
        you_are(lines, final, description, '');
    }
    if (active(UNCHANGING) && Upolyd(u))
        you_can(lines, final, 'not change from your current form',
            from_what(UNCHANGING, state));
    if (u.ulycn >= LOW_PM || hates_silver(state.youmonst?.data))
        you_are(lines, final, 'harmed by silver', '');

    if (active(FAST))
        you_are(lines, final, veryFast ? 'very fast' : 'fast',
            from_what(FAST, state));

    // C ref: insight.c:1900. Reflection is reported after movement speed and
    // retains the wizard-mode source suffix from attrib.c from_what().
    if (active(REFLECTING))
        you_have(lines, final, 'reflection',
            from_what(REFLECTING, state));

    // C ref: insight.c:1902-1906. These capability lines retain their source
    // wording where from_what() has one and preserve C's order.
    if (e(FREE_ACTION))
        you_have(lines, final, 'free action',
            from_what(FREE_ACTION, state));
    if (e(FIXED_ABIL))
        you_have(lines, final, 'fixed abilities',
            from_what(FIXED_ABIL, state));
    if (e(LIFESAVED))
        enl_msg(lines, final, 'Your life ', 'will be', 'would have been',
            ' saved', '');

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

    if (u.ugangr) {
        const intensity = u.ugangr > 6 ? 'extremely '
            : u.ugangr > 3 ? 'very ' : '';
        enl_msg(lines, final, u_gname(state), ' is', ' was',
            ` ${intensity}angry with you`, state.wizard
                ? ` (${u.ugangr})` : '');
    } else if (!final) {
        buf = `${await can_pray(false, state) ? '' : 'not '}safely pray`;
        if (state.wizard) buf += ` (${u.ublesscnt})`;
        you_can(lines, final, buf, '');
    }

    // insight.c:1975-2005.  In-progress/quit disclosures use N_times()
    // (once/twice/thrice/"N times"), while a dead disclosure uses ordin().
    const mortality = Number(u.umortality ?? 0);
    let mortalityVerb;
    let mortalitySuffix = '';
    if (final < ENL_GAMEOVERDEAD) {
        mortalityVerb = 'survived after being killed ';
        if (!mortality)
            mortalityVerb = final ? 'survived' : null;
        else {
            mortalitySuffix = N_times(mortality);
        }
    } else {
        mortalityVerb = 'are dead';
        if (mortality > 1)
            mortalitySuffix = ` (${mortality}${ordin(mortality)} time!)`;
    }
    if (mortalityVerb)
        enl_msg(lines, final, You_, 'have been killed ', mortalityVerb,
            mortalitySuffix, '');
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

// C ref: insight.c record_achievement() (2406-2471). The achievement list is
// kept in u.uachieved, while the chronicle event is owned by pline.c. The
// optional SoundAchievement() interface has no browser owner and is recorded
// as a discarded side effect; all state and text used by the source event is
// retained here.
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

    // C plays the achievement sound even for a duplicate. The sound result is
    // discarded by its caller and the browser has no sound-achievement owner.
    note_unported('sounds.c SoundAchievement');
    if (repeat_achievement)
        return; /* already recorded, don't duplicate it */
    u.uachieved[i] = achidx;

    // Final disclosure records the achievement list but deliberately omits
    // the ordinary chronicle event; really_done() owns the separate ascension
    // entry in C.
    if (state.program_state?.gameover)
        return;

    if (absidx >= ACH_RNK1 && absidx <= ACH_RNK8) {
        const rank = absidx - (ACH_RNK1 - 1);
        const level = rank < 1 ? 1 : rank < 2 ? 3
            : rank < 8 ? rank * 4 - 2 : 30;
        const title = rank_of(
            level,
            state.urole?.mnum,
            achidx < 0,
            state,
        );
        livelog_printf(
            rank < 4 ? LL_MINORAC | LL_DUMP : LL_ACHIEVE,
            `attained the rank of ${title} (level ${state.u.ulevel})`,
            state,
        );
    } else if (absidx === ACH_MINE_PRIZE || absidx === ACH_SOKO_PRIZE) {
        const tracking = state.context?.achieveo ?? {};
        const otyp = absidx === ACH_SOKO_PRIZE
            ? tracking.soko_prize_otyp
            : tracking.mines_prize_otyp;
        const msg = absidx === ACH_SOKO_PRIZE
            ? 'acquired the Sokoban'
            : "acquired the Mines' End";
        const flags = absidx === ACH_SOKO_PRIZE
            ? LL_ACHIEVE | LL_SPOILER : LL_ACHIEVE | LL_SPOILER;
        livelog_printf(
            flags,
            `${msg} ${OBJ_NAME(state.objects?.[otyp], state) ?? ''}`,
            state,
        );
    } else {
        const messages = {
            [ACH_BELL]: 'acquired the Bell of Opening',
            [ACH_HELL]: 'entered Gehennom',
            [ACH_CNDL]: 'acquired the Candelabrum of Invocation',
            [ACH_BOOK]: 'acquired the Book of the Dead',
            [ACH_INVK]: 'performed the invocation',
            [ACH_AMUL]: 'acquired The Amulet of Yendor',
            [ACH_ENDG]: 'entered the Elemental Planes',
            [ACH_ASTR]: 'entered the Astral Plane',
            [ACH_UWIN]: 'ascended',
            [ACH_MEDU]: 'killed Medusa',
            [ACH_MINE]: 'entered the Gnomish Mines',
            [ACH_TOWN]: 'reached Mine Town',
            [ACH_SHOP]: 'entered a shop',
            [ACH_TMPL]: 'entered a temple',
            [ACH_ORCL]: 'consulted the Oracle',
            [ACH_NOVL]: 'read a Discworld novel',
            [ACH_SOKO]: 'entered Sokoban',
            [ACH_BGRM]: 'entered the Bigroom',
            [ACH_TUNE]: "learned castle drawbridge's tune",
        };
        const flags = {
            [ACH_MINE]: LL_MINORAC | LL_DUMP,
            [ACH_TOWN]: LL_ACHIEVE,
            [ACH_SHOP]: LL_MINORAC,
            [ACH_TMPL]: LL_MINORAC,
            [ACH_ORCL]: LL_ACHIEVE,
            [ACH_NOVL]: LL_MINORAC | LL_DUMP,
            [ACH_SOKO]: LL_ACHIEVE,
            [ACH_BGRM]: LL_ACHIEVE,
            [ACH_TUNE]: LL_MINORAC,
            [ACH_MEDU]: LL_ACHIEVE | LL_UMONST,
        };
        livelog_printf(
            flags[absidx] ?? LL_ACHIEVE,
            messages[absidx] ?? '',
            state,
        );
    }
}

// C ref: insight.c remove_achievement() (2476-2493). The signed value keeps
// the female-rank encoding, so compare absolute values and compact the
// zero-terminated list after the first match.
export function remove_achievement(achidx, state = game) {
    const achievements = state.u?.uachieved ?? [];
    let index = 0;
    for (; achievements[index]; ++index) {
        if (Math.abs(achievements[index]) === Math.abs(achidx)) break;
    }
    if (!achievements[index]) return false;
    do {
        achievements[index] = achievements[index + 1] ?? 0;
        ++index;
    } while (achievements[index]);
    return true;
}

// C ref: insight.c num_genocides() (2953-2966). The reference walks every
// species' mvital flags, including unique species; an impossible() diagnostic
// for a unique genocide has no gameplay return value, so its unported message
// is recorded only when that otherwise-invalid state is encountered.
export function num_genocides(state = game) {
    const mvitals = state.svm?.mvitals ?? state.mvitals ?? [];
    const monsters = state.mons ?? [];
    let count = 0;
    for (let index = LOW_PM; index < mvitals.length; ++index) {
        if ((mvitals[index]?.mvflags ?? 0) & G_GENOD) {
            ++count;
            if ((monsters[index]?.geno ?? 0) & G_UNIQ
                && index !== PM_HIGH_CLERIC)
                note_unported('pline.c impossible');
        }
    }
    return count;
}

// C ref: insight.c sokoban_in_play() (2517-2528). This intentionally follows
// the entered-Sokoban achievement rather than the current dungeon branch.
export function sokoban_in_play(state = game) {
    for (const achievement of state.u?.uachieved ?? []) {
        if (!achievement) break;
        if (achievement === ACH_SOKO) return true;
    }
    return false;
}

// C ref: insight.c show_conduct() (2089-2236). The text-window helper models
// C's NHW_MENU display and dismissal; all line construction preserves the
// source order and its present/past tense helpers. show_achievements() is a
// void callee whose ordinary in-progress non-wizard branch returns before
// producing output. Its wizard/final disclosure branch remains an explicit
// discarded gap until that adjacent source function is ported.
export async function show_conduct(final = ENL_GAMEINPROGRESS,
                                   state = game,
                                   { displayMenuWindow = displayTtyMenuTextWindow } = {}) {
    const u = state.u ?? {};
    const conduct = u.uconduct ?? {};
    const roleplay = u.uroleplay ?? {};
    const lines = ['Voluntary challenges:'];
    const count = (key) => Math.trunc(conduct[key] ?? 0);

    if (!roleplay.reroll) {
        lines.push(' Character rerolling was not enabled.');
    } else if (!roleplay.numrerolls) {
        lines.push(' Your character was not rerolled.');
    } else {
        enlght_out(lines, ` Your character was rerolled ${N_times(
            roleplay.numrerolls,
        )}.`);
    }
    if (roleplay.blind) you_have_been(lines, final, 'blind from birth');
    if (roleplay.deaf) you_have_been(lines, final, 'deaf from birth');
    if (roleplay.pauper) {
        enl_msg(lines, final, You_, state.invent ? 'started' : 'are',
            'started out', ' without possessions', '');
    }
    if (roleplay.nudist) you_have_been(lines, final, 'faithfully nudist');

    if (!count('food')) {
        enl_msg(lines, final, You_, 'have gone', 'went', ' without food', '');
    } else if (!count('unvegan')) {
        you_have_X(lines, final, 'followed a strict vegan diet');
    } else if (!count('unvegetarian')) {
        you_have_been(lines, final, 'vegetarian');
    }

    if (!count('gnostic')) you_have_been(lines, final, 'an atheist');

    if (!count('weaphit')) {
        you_have_never(lines, final, 'hit with a wielded weapon');
    } else if (state.wizard) {
        you_have_X(lines, final,
            `hit with a wielded weapon ${count('weaphit')} time${
                plur(count('weaphit'))
            }`);
    }
    if (!count('killer')) you_have_been(lines, final, 'a pacifist');

    if (!count('literate')) {
        you_have_been(lines, final, 'illiterate');
    } else if (state.wizard) {
        you_have_X(lines, final,
            `read items or engraved ${count('literate')} time${
                plur(count('literate'))
            }`);
    }
    if (!count('pets')) you_have_never(lines, final, 'had a pet');

    const genocided = num_genocides(state);
    if (!genocided) {
        you_have_never(lines, final, 'genocided any monsters');
    } else {
        you_have_X(lines, final,
            `genocided ${genocided} type${plur(genocided)} of monster${
                plur(genocided)
            }`);
    }

    if (!count('polypiles')) {
        you_have_never(lines, final, 'polymorphed an object');
    } else if (state.wizard) {
        you_have_X(lines, final,
            `polymorphed ${count('polypiles')} item${plur(count('polypiles'))}`);
    }
    if (!count('polyselfs')) {
        you_have_never(lines, final, 'changed form');
    } else if (state.wizard) {
        you_have_X(lines, final,
            `changed form ${count('polyselfs')} time${plur(count('polyselfs'))}`);
    }

    if (!count('wishes')) {
        you_have_X(lines, final, 'used no wishes');
    } else {
        let wishText = `used ${count('wishes')} wish${
            count('wishes') > 1 ? 'es' : ''
        }`;
        if (count('wisharti')) {
            const artifactText = count('wisharti') === count('wishes')
                ? (count('wisharti') > 2 ? 'all '
                    : count('wisharti') === 2 ? 'both ' : '')
                : `${count('wisharti')} `;
            wishText += ` (${artifactText}for ${count('wisharti') === 1
                ? 'an artifact' : 'artifacts'})`;
        }
        you_have_X(lines, final, wishText);
        if (!count('wisharti')) {
            enl_msg(lines, final, You_, 'have not wished', 'did not wish',
                ' for any artifacts', '');
        }
    }

    if (sokoban_in_play(state)) {
        let presentverb = 'have violated';
        let pastverb = 'violated';
        let sokobuf;
        if (!count('sokocheat')) {
            presentverb = 'have not violated';
            pastverb = 'did not violate';
            sokobuf = ' any of the special Sokoban rules';
        } else {
            sokobuf = ` the special Sokoban rules ${N_times(
                count('sokocheat'),
            )}`;
        }
        enl_msg(lines, final, You_, presentverb, pastverb, sokobuf, '');
    }

    let hasAchievement = false;
    for (const achievement of u.uachieved ?? []) {
        if (!achievement) break;
        hasAchievement = true;
        break;
    }
    if ((final !== ENL_GAMEINPROGRESS || state.wizard) && hasAchievement)
        note_unported('insight.c show_achievements');
    await displayMenuWindow(state, lines.map((text) => ({ text })));
}

// C ref: insight.c doconduct() (2081-2085).
export async function doconduct(state = game,
                                { showConduct = show_conduct } = {}) {
    await showConduct(ENL_GAMEINPROGRESS, state);
    return ECMD_OK;
}

// C ref: insight.c do_gamelog() (2532-2544) and show_gamelog()
// (2561-2595). The linked list is stored by pline.c; this function only
// selects and formats it. displayTtyTextWindow owns NHW_TEXT's blocking
// display and dismissal, preserving the command's wait for input.
const LL_MAJORS = LL_WISH | LL_ACHIEVE | LL_UMONST | LL_DIVINEGIFT
    | LL_LIFESAVE | LL_ARTIFACT | LL_GENOCIDE | LL_DUMP;

export async function show_gamelog(final = ENL_GAMEINPROGRESS,
                                   state = game,
                                   { displayTextWindow = displayTtyTextWindow } = {}) {
    const isFinal = Boolean(final);
    const lines = [`${isFinal ? 'Major' : 'Logged'} events:`];
    let eventCount = 0;
    for (const event of state.gamelog ?? []) {
        if (isFinal && !(event.flags & LL_MAJORS)) continue;
        if (!isFinal && !state.wizard && (event.flags & LL_SPOILER)) continue;
        if (!eventCount++) lines.push(' Turn');
        lines.push(truncateByteString(
            `${String(event.turn).padStart(5, ' ')}: ${event.text}`,
            BUFSZ - 1,
        ));
    }
    if (!eventCount) lines.push(' none');
    await displayTextWindow(state, lines.map((text) => ({ text })));
}

export async function do_gamelog(state = game,
                                 { displayTextWindow = displayTtyTextWindow } = {}) {
    if (state.gamelog?.length)
        await show_gamelog(ENL_GAMEINPROGRESS, state, { displayTextWindow });
    else
        await ttyPline('No chronicled events.', state);
    return ECMD_OK;
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
