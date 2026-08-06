// insight.js -- the attributes window that `^X` opens, and the one-line
// self-report a stethoscope produces.
// C ref: src/insight.c enlght_out(), enlght_line(), enl_msg(), you_are(),
// you_have(), attrval(), fmt_elapsed_time(), enlightenment(),
// background_enlightenment(), basics_enlightenment(),
// characteristics_enlightenment(), one_characteristic(),
// status_enlightenment(), weapon_insight(), doattributes(), align_str(),
// piousness(), and ustatusline().
//
// `doattributes()` is the only ported caller, so `mode` is BASICENLIGHTENMENT
// alone and `final` is ENL_GAMEINPROGRESS. `enlightenment()` refuses every
// other pair, which is what keeps end-of-game disclosure and the magic
// sections out. The `final` parameter is still threaded through the sections,
// so the signatures and call shapes match the C, but it is provably always
// ENL_GAMEINPROGRESS: no past-tense arm in this file has ever executed, and
// none has been validated. A site that collapses C's three-way choice on
// `final` says so in a comment, so end-of-game disclosure can find it.
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
    BASICENLIGHTENMENT,
    BLINDED,
    CONFUSION,
    DEAF,
    ENL_GAMEINPROGRESS,
    EXT_ENCUMBER,
    FAST,
    FIXED_ABIL,
    FLYING,
    FULL_MOON,
    FUMBLING,
    GLIB,
    HALLUC,
    HANDED,
    HUNGER,
    HVY_ENCUMBER,
    In_endgame,
    In_quest,
    INVIS,
    Is_bigroom,
    Is_knox_level,
    Is_rogue_level,
    LEVITATION,
    M_AP_NOTHING,
    MAGICENLIGHTENMENT,
    MOD_ENCUMBER,
    N_ACH,
    NEW_MOON,
    OVERLOADED,
    P_ISRESTRICTED,
    P_NONE,
    P_SKILLED,
    P_UNSKILLED,
    plur,
    SICK,
    SLEEPY,
    SLIMED,
    SLT_ENCUMBER,
    STONED,
    STR18,
    STRANGLED,
    STUNNED,
    UNENCUMBERED,
    Upolyd,
    VOMITING,
    WOUNDED_LEGS,
    WWALKING,
} from './const.js';
import { timet_delta } from './allmain.js';
import { effective_attribute } from './attrib.js';
import { getnow, midnight, night } from './calendar.js';
import { enc_stat } from './display.js';
import { depth, dunlev } from './dungeon.js';
import { hu_stat } from './eat.js';
import { game } from './gstate.js';
import { near_capacity } from './hack.js';
import { lcase, lowc, highc, mungspaces, strsubst } from './hacklib.js';
import { currency, money_cnt } from './invent.js';
import { makeplural } from './fruit.js';
import { an } from './objnam.js';
import {
    DUNCE_CAP,
    GAUNTLETS_OF_POWER,
    SHIELD_OF_REFLECTION,
    TOWEL,
} from './objects.js';
import { align_gname, u_gname } from './pray.js';
import { is_ammo } from './obj.js';
import { body_part } from './polyself.js';
import { visible_region_at } from './region.js';
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
    if (suffix && (!showneg || record >= 0)) {
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
        throw new UnsupportedEnlightenmentError('endgamelevelname()');
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
    /* the "N more needed" clause is gated on final or wizard, neither of
       which a ^X in an ordinary game in progress satisfies */
    you_have(lines, final,
        `${u.uexp} experience point${plur(u.uexp)}`, '');
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
        // C splits here: inside a shop the line ends ", but temporarily
        // disabled while inside the shop" and never reaches oc_to_str().
        // costly_spot() answers FALSE on a shopless level and stops on a shop
        // level, so each arm's stop names the source it actually needs.
        costly_spot(state.u.ux, state.u.uy, state);
        // options.c optfn_pickup_types() is what turns the option into
        // flags.pickup_types; it is not ported, so oc_to_str() has nothing
        // to read and this branch stops.
        throw new UnsupportedEnlightenmentError('optfn_pickup_types()');
    }
    enl_msg(lines, final, 'Autopickup ', 'is ', 'was ', 'off', '');
}

// C ref: insight.c one_characteristic().
function one_characteristic(mode, final, attrindx, state, lines) {
    let hide_innate_value = false;

    /* being polymorphed or wearing certain cursed items prevents the hero
       from reliably tracking changes to characteristics */
    // youprop.h:385 defines Fixed_abil as the extrinsic alone; there is no
    // HFixed_abil term, so an intrinsic in this slot leaves the macro FALSE
    // and C prints the characteristic normally.
    if (state.u.uprops?.[FIXED_ABIL]?.extrinsic) {
        // stuck_ring() needs the welded-ring rules, which are not ported.
        throw new UnsupportedEnlightenmentError('stuck_ring()');
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
    if (mode & MAGICENLIGHTENMENT) hide_innate_value = false;

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
        } else {
            throw new UnsupportedEnlightenmentError(
                'the two-weapon skill report',
            );
        }
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
    [SLEEPY, 'the narcolepsy status'],
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

    enlght_out(lines, ''); /* separator after title or characteristics */
    enlght_out(lines, final ? 'Final Status:' : 'Status:');

    /* hunger/nutrition; the status line omits "not hungry" and we do not */
    let buf = mungspaces(hu_stat[u.uhs]);
    if (!buf) buf = 'not hungry';
    buf = lowc(buf[0]) + buf.slice(1); /* override capitalization */
    if (buf === 'weak') buf += ' from severe hunger';
    else if (buf.startsWith('faint')) buf += ' due to starvation';
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
        buf += `; movement ${!final ? 'is' : 'was'} ${adj}`
            + `${(cap < OVERLOADED) ? ' slowed' : ''}`;
        you_are(lines, final, buf, '');
    } else {
        /* last resort entry, guarantees Status section is non-empty */
        you_are(lines, final, 'unencumbered', '');
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

// C ref: insight.c enlightenment(). Builds the whole window's lines. C
// creates the menu window first and destroys it last; this port opens no
// window until the list is complete, so an unported branch leaves the screen
// untouched.
export function enlightenment(mode, final, state = game) {
    if (final !== ENL_GAMEINPROGRESS)
        throw new UnsupportedEnlightenmentError('end-of-game disclosure');
    if (mode !== BASICENLIGHTENMENT)
        throw new UnsupportedEnlightenmentError('attributes_enlightenment()');
    if (Upolyd(state.u))
        throw new UnsupportedEnlightenmentError('a polymorphed hero');

    const lines = [];
    const tmpbuf = highc(state.plname[0]) + state.plname.slice(1);
    /* title: "Conan the Archeologist's attributes:" */
    enlght_out(lines, `${tmpbuf} the ${(state.flags.female
        && state.urole.name.f) ? state.urole.name.f
        : state.urole.name.m}'s attributes:`);

    /* role, race, alignment, deities, dungeon level, time, experience */
    background_enlightenment(final, state, lines);
    /* hit points, energy points, armor class, gold */
    basics_enlightenment(final, state, lines);
    /* strength, dexterity, &c */
    characteristics_enlightenment(mode, final, state, lines);
    /* expanded status line information */
    status_enlightenment(mode, final, state, lines);

    enlght_out(lines, ''); /* separator */
    enlght_out(lines, 'Miscellaneous:');
    /* the reminder block between the heading and the elapsed time is gated
       on wizard, discover, or final, none of which an ordinary ^X sets */
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
    const lines = enlightenment(
        BASICENLIGHTENMENT
            | ((state.wizard || state.discover) ? MAGICENLIGHTENMENT : 0),
        ENL_GAMEINPROGRESS,
        state,
    );
    await menu(lines, state);
    return false;
}
