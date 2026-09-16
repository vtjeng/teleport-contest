// read.js -- reading scrolls and spellbooks, plus monster-creation helpers.
// C refs: src/read.c read_ok(), doread(), cant_revive(),
// create_particular_parse(), create_particular_creation() and
// create_particular(). doread() completes a known ordinary magic-mapping
// scroll, the ordinary unknown identify-scroll path whose remaining pack is
// fully identified, an ordinary positive enchant-weapon scroll, and declining
// a fresh known healing-spell refresh. Light scrolls use seffect_light(),
// including calm, cursed and confused branches. It also takes a calm ordinary
// teleportation scroll through seffects() and
// seffect_teleportation() into scrolltele(), which handles the uncontrolled
// safe_teleds path; a blessed confused teleportation scroll goes through
// level_tele(), which handles the confused random_levtport path through
// random_teleport_level(); a cursed remove-curse scroll goes through
// seffect_remove_curse(), which prints the You_feel/disintegrates messages
// and skips the invent-traversal loop; other selected readable objects stop
// before pickup_prev changes.
// wizcmds.c wiz_genesis() calls the monster-creation helpers.

import {
    A_INT,
    A_WIS,
    BLINDED,
    COLNO,
    CONFUSION,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FEMALE,
    CORR,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    G_GONE,
    HALLUC,
    MALE,
    MM_FEMALE,
    MM_EDOG,
    MM_MALE,
    MM_NOMSG,
    MM_NOEXCLAM,
    NO_MINVENT,
    NEUTRAL,
    NO_MM_FLAGS,
    ROWNO,
    ROOMOFFSET,
    LS_OBJECT,
    STRAT_APPEARMSG,
    STRAT_WAITFORU,
    SPE_LIM,
    W_BALL,
    W_CHAIN,
    WT_IRON_BALL_INCR,
    Is_rogue_level,
    Is_waterlevel,
    isok,
    ismnum,
    LL_CONDUCT,
} from './const.js';
import {
    PM_ALIGNED_CLERIC,
    PM_ANGEL,
    PM_DOPPELGANGER,
    PM_GUARD,
    PM_BLACK_LIGHT,
    PM_GREMLIN,
    PM_HIGH_CLERIC,
    PM_HUMAN_ZOMBIE,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_SHOPKEEPER,
    PM_WIZARD,
    PM_YELLOW_LIGHT,
} from './monsters.js';
import { digit, mungspaces, strstri } from './hacklib.js';
import { game } from './gstate.js';
import {
    check_capacity,
    nomul,
    notice_mon_off,
    notice_mon_on,
} from './hack.js';
import { getobj, identify_pack, update_inventory, useup } from './invent.js';
import { getlin } from './windows.js';
import {
    is_female,
    is_male,
    can_chant,
    amorphous,
    is_whirly,
    name_to_monplus,
    unsolid,
    unique_corpstat,
} from './mondata.js';
import { initedog } from './dog.js';
import { makemon_runtime } from './makemon_create.js';
import { Monnam } from './do_name.js';
import { MAXMCLASSES } from './symbols.js';
import {
    BRASS_LANTERN,
    BALL_CLASS,
    CHAIN_CLASS,
    MAGIC_LAMP,
    OIL_LAMP,
    RING_CLASS,
    SCROLL_CLASS,
    SCR_DESTROY_ARMOR,
    SCR_ENCHANT_WEAPON,
    SCR_BLANK_PAPER,
    TOOL_CLASS,
    WAND_CLASS,
    SCR_IDENTIFY,
    SCR_LIGHT,
    SCR_MAGIC_MAPPING,
    SCR_PUNISHMENT,
    SCR_REMOVE_CURSE,
    SCR_TELEPORTATION,
    DUNCE_CAP,
    LENSES,
    OBJ_DESCR,
    SPE_BLANK_PAPER,
    SPE_BOOK_OF_THE_DEAD,
    SPE_NOVEL,
    SPBOOK_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import {
    is_flammable,
    is_weptool,
    mkobj,
    objectType,
    place_object,
} from './obj.js';
import { acurr, exercise } from './attrib.js';
import { do_mapping } from './detect.js';
import { In_W_tower, Is_special } from './dungeon.js';
import { level_tele, scrolltele } from './teleport.js';
import { lightdamage } from './zap.js';
import { discover_object } from './o_init.js';
import { more_experienced } from './exper.js';
import { rn1, rn2, rnl, rnd } from './rng.js';
import { ttyPline } from './tty_message.js';
import { newsym } from './display.js';
import { flooreffects, trycall } from './do.js';
import { y_n } from './cmd.js';
import {
    study_book,
    study_book_preflight,
} from './spell.js';
import { destroy_arm, some_armor, setwornEnv } from './do_wear.js';
import { setworn } from './worn.js';
import { chwepon } from './wield.js';
import { ART_SUNSWORD, artifact_light } from './artifacts.js';
import { del_light_source } from './light.js';
import { do_clear_area, vision_recalc } from './vision.js';
import { canSpotMonster } from './startup_a11y.js';
import { m_at } from './monst.js';
import { livelog_printf } from './pline.js';

// A selected scroll or spellbook enters doread()'s effect arms. Raising before
// pickup_prev changes keeps every unsupported object and the turn retryable
// while preserving the prompt screens already produced.
export class UnsupportedReadError extends Error {
    constructor(branch) {
        super(`reading requires ${branch}`);
        this.name = 'UnsupportedReadError';
        this.branch = branch;
    }
}

// C ref: read.c read_ok() (313-322). Scrolls and spellbooks appear as likely
// choices. Other carried objects remain selectable but are omitted from the
// suggested-letter set, and the hands/self sentinel is excluded.
export function read_ok(obj) {
    if (!obj) return GETOBJ_EXCLUDE;
    if (obj.oclass === SCROLL_CLASS || obj.oclass === SPBOOK_CLASS)
        return GETOBJ_SUGGEST;
    return GETOBJ_DOWNPLAY;
}

// C ref: read.c charge_ok() (689-724). Filter for getobj() when choosing an
// object to recharge: wands are suggested, identified chargeable rings and
// tools are suggested, and everything else is excluded but selectable.
export function charge_ok(obj) {
    if (!obj) return GETOBJ_EXCLUDE;
    if (obj.oclass === WAND_CLASS) return GETOBJ_SUGGEST;
    if (obj.oclass === RING_CLASS && objectType(obj.otyp).oc_charged
        && obj.dknown && objectType(obj.otyp).oc_name_known)
        return GETOBJ_SUGGEST;
    if (is_weptool(obj)) return GETOBJ_EXCLUDE;
    if (obj.oclass === TOOL_CLASS) {
        if (obj.otyp === BRASS_LANTERN
            || obj.otyp === OIL_LAMP
            || (obj.otyp === MAGIC_LAMP
                && !objectType(MAGIC_LAMP).oc_name_known))
            return GETOBJ_SUGGEST;
        if (objectType(obj.otyp).oc_charged)
            return (obj.dknown && objectType(obj.otyp).oc_name_known)
                ? GETOBJ_SUGGEST : GETOBJ_DOWNPLAY;
        return GETOBJ_EXCLUDE;
    }
    return GETOBJ_EXCLUDE_SELECTABLE;
}

function propertyActive(property, state) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// The queued slice admits only the ordinary, unknown destroy-armor scroll
// fallback with exactly one worn, flammable armor object. The full
// seffect_destroy_armor() family (cursed, blessed-selection, confused and
// no-effective-armor branches) remains behind the selected-read boundary.
function oneWornFlammableArmor(state) {
    const worn = [
        state.uarm,
        state.uarmc,
        state.uarmh,
        state.uarms,
        state.uarmg,
        state.uarmf,
        state.uarmu,
    ].filter(Boolean);
    return worn.length === 1 && is_flammable(worn[0], state);
}

// C ref: spell.c study_book() (537-584).  This helper names the small
// portion of spellbook study that can be admitted without the occupation
// installed by learn(): an ordinary, non-wizard reader can find an uncursed
// book too difficult, then take cursed_book()'s aggravation result and keep
// the book when its final crumble roll is nonzero.
function spellbookLevel(type) {
    return Math.trunc(type.oc_level ?? type.oc_oc2 ?? 0);
}

function hasKnownSpell(otyp, state) {
    return (state.svs?.spl_book ?? []).some((spell) => spell?.sp_id === otyp);
}

function tooHardSpellbookPreflight(spellbook, state) {
    if (!spellbook || spellbook.oclass !== SPBOOK_CLASS
        || spellbook.blessed || spellbook.cursed || spellbook.in_use
        || spellbook.otyp === SPE_BLANK_PAPER
        || spellbook.otyp === SPE_BOOK_OF_THE_DEAD
        || spellbook.otyp === SPE_NOVEL
        || state.urole?.mnum === PM_WIZARD
        || state.uarmh?.otyp === DUNCE_CAP
        || propertyActive(BLINDED, state)
        || propertyActive(CONFUSION, state)
        || state.context?.spbook?.delay
        || state.context?.spbook?.book
        || hasKnownSpell(spellbook.otyp, state)) return false;

    const type = objectType(spellbook, state);
    const level = spellbookLevel(type);
    if (OBJ_DESCR(type, state) === 'dull' || level < 1 || level > 7) {
        return false;
    }

    const readAbility = acurr(state, A_INT)
        + 4 + Math.trunc(state.u.ulevel / 2) - 2 * level
        + ((state.ublindf?.otyp === LENSES) ? 2 : 0);
    return readAbility < 20;
}

// C ref: wizard.c aggravate() (493-511).  It has no messages.  The tower
// comparison is retained even though the selected witness is on Dlvl:1: it
// is part of the state contract for every monster the helper may visit.
function aggravateMonsters(state) {
    const heroInTower = In_W_tower(
        state.u.ux, state.u.uy, state.u.uz, state,
    );
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if ((monster.mhp ?? 0) < 1) continue;
        if (In_W_tower(monster.mx, monster.my, state.u.uz, state)
            !== heroInTower) continue;
        monster.mstrategy &= ~(STRAT_WAITFORU | STRAT_APPEARMSG);
        monster.msleeping = false;
        if (!monster.mcanmove && !rn2(5)) {
            monster.mfrozen = 0;
            monster.mcanmove = true;
        }
    }
}

// C ref: spell.c study_book() (575-619) and cursed_book() (130-183).
// Successful ordinary study delegates its occupation setup to study_book();
// the too-hard arm remains limited to cursed_book()'s case 1 and its nonzero
// crumble result. The random draw is consumed before either outcome, so the
// boundary remains source-ordered without pretending to implement the
// teleport, blindness, gold, poison, explosion, or rndcurse arms.
async function studyTooHardSpellbook(spellbook, state) {
    if (!tooHardSpellbookPreflight(spellbook, state)) {
        throw new UnsupportedReadError('the selected spellbook branch');
    }

    const type = objectType(spellbook, state);
    const level = spellbookLevel(type);
    const readAbility = acurr(state, A_INT)
        + 4 + Math.trunc(state.u.ulevel / 2) - 2 * level
        + ((state.ublindf?.otyp === LENSES) ? 2 : 0);

    // C sets in_use before the ordinary uncursed-book difficulty roll.
    spellbook.in_use = true;

    // C's rnd(20) is the ordinary uncursed-book difficulty roll. A successful
    // study reaches study_book(), which installs learn() as the occupation.
    if (rnd(20) <= readAbility) {
        return await study_book(spellbook, state, {
            successfulStudy: true,
            message: ttyPline,
        });
    }

    state.context ??= {};
    state.context.spbook ??= { delay: 0, book: null, o_id: 0 };
    state.context.spbook.delay = level <= 2
        ? -type.oc_delay
        : level <= 4
            ? -(level - 1) * type.oc_delay
            : level <= 6
                ? -level * type.oc_delay
                : level === 7 ? -8 * type.oc_delay : 0;
    // cursed_book() chooses one of `objects[booktype].oc_level` effects.
    // Case 1 is the witness branch: it only calls aggravate() after speaking.
    if (rn2(level) !== 1) {
        throw new UnsupportedReadError('cursed_book() outcome');
    }
    await ttyPline('You feel threatened.', state);
    aggravateMonsters(state);

    nomul(state.context.spbook.delay, state);
    state.multi_reason = 'reading a book';
    state.nomovemsg = null;
    state.context.spbook.delay = 0;

    // C uses the book only when this draw is nonzero; the zero arm also
    // needs trycall() and useup(), so it remains fail-closed.
    if (!rn2(3)) {
        throw new UnsupportedReadError('cursed_book() spellbook crumble');
    }
    spellbook.in_use = false;
    return true;
}

// C ref: read.c doread() (347-646), restricted after getobj() to the known,
// uncursed magic-mapping scroll, an ordinary unknown identify scroll, an
// ordinary positive
// enchant-weapon scroll, the source-reachable solid-human punishment-scroll
// arms, and the fresh-known healing-book refresh decline.
// The other admitted paths are a sighted,
// non-hallucinating wizard reading a blessed teleportation scroll while
// confused, and the calm ordinary teleportation-scroll path. The former
// proceeds through seffect_teleportation() into level_tele(), which handles
// the confused random_levtport path; the latter reaches teleport.c:scrolltele().
// Every other selected object stops before C's scroll->pickup_prev write.

function solidPunishmentTarget(state) {
    const species = state.youmonst?.data;
    // read.c:3036-3044 has separate amorphous, whirly and unsolid fall-away
    // arms. They are outside this divergence, as is placement while swallowed;
    // admit only the solid, visible first-read arm here. A previously attached
    // ball is handled by punish() before these checks and needs no species test.
    return !propertyActive(BLINDED, state)
        && !state.u?.uswallow
        && species
        && !amorphous(species)
        && !is_whirly(species)
        && !unsolid(species);
}

function punishmentReadAdmitted(scroll, confused, state) {
    if (scroll.oclass !== SCROLL_CLASS || scroll.otyp !== SCR_PUNISHMENT)
        return false;
    // doread()'s blind guard at read.c:561-575 allows a scroll only after its
    // description has been seen. The guilty and repeated-ball arms do not
    // need the blind ball-and-chain display setup; the first creation arm
    // remains sighted.
    if (propertyActive(BLINDED, state)
        && !confused && !scroll.blessed && !state.uball) return false;
    if (confused || scroll.blessed || state.uball) return true;
    return solidPunishmentTarget(state);
}

// C ref: read.c punish() (3019-3062), plus the solid, non-swallowed
// placebc_core() arm required by its scroll caller. Reuse-ball, fall-away,
// swallowed and blind display branches remain outside this divergence.
export async function punish(scroll, state = game) {
    const cursedLevy = scroll?.cursed ? 1 : 0;

    await ttyPline('You are being punished for your misbehavior!', state);
    if (state.uball) {
        await ttyPline('Your iron ball gets heavier.', state);
        state.uball.owt += WT_IRON_BALL_INCR * (1 + cursedLevy);
        return;
    }

    if (!solidPunishmentTarget(state)) {
        throw new UnsupportedReadError(
            'punish() fall-away, swallowed, or blind branch',
        );
    }

    // C makes and wears the chain before making and wearing the ball. mkobj()
    // owns the exact rnd(1000), next_ident() and erosion draw sequence for each
    // generic class; setworn() owns the state.uball/state.uchain pointers.
    const chain = mkobj(CHAIN_CLASS, true, { state });
    setworn(chain, W_CHAIN, setwornEnv(state));
    const ball = mkobj(BALL_CLASS, true, { state });
    setworn(ball, W_BALL, setwornEnv(state));

    // placebc_core(): ball first establishes BCPOS_CHAIN, then chain is placed
    // above it. The source checks floor effects before either object is placed;
    // the existing ordinary-floor implementation covers this witness and
    // fails closed on its other square-specific arms.
    const floorEffects = {
        state,
        unsupported: (reason) => {
            throw new UnsupportedReadError(`punish() floor effect: ${reason}`);
        },
    };
    flooreffects(chain, state.u.ux, state.u.uy, '', floorEffects);
    flooreffects(ball, state.u.ux, state.u.uy, '', floorEffects);
    // The glyph is sampled before newsym() paints the objects.
    place_object(ball, state.u.ux, state.u.uy, { state });
    state.u.bc_order = 1; // BCPOS_CHAIN from ball.c:108.
    place_object(chain, state.u.ux, state.u.uy, { state });
    const glyph = state.level.at(state.u.ux, state.u.uy).glyph;
    state.u.bglyph = glyph;
    state.u.cglyph = glyph;
    newsym(state.u.ux, state.u.uy);
    // punish() calls newsym() again after placebc(); preserve that source call.
    newsym(state.u.ux, state.u.uy);
}

// C ref: read.c seffect_punishment() (1976-1988). The effect is known as soon
// as read, while blessed or confused scrolls stop after the guilt message and
// leave the scroll for doread() to consume.
export async function seffect_punishment(scroll, state = game) {
    if (scroll?.otyp !== SCR_PUNISHMENT || scroll.oclass !== SCROLL_CLASS)
        throw new UnsupportedReadError('the selected punishment-scroll branch');
    state.gk.known = true;
    if (scroll.blessed || propertyActive(CONFUSION, state)) {
        await ttyPline('You feel guilty.', state);
        return;
    }
    await punish(scroll, state);
}

export async function doread(state = game) {
    state.gk ??= {};
    state.gk.known = false;
    if (await check_capacity(null, state)) return ECMD_OK;

    const scroll = await getobj('read', read_ok, GETOBJ_PROMPT, state);
    if (!scroll) return ECMD_CANCEL;
    const confused = propertyActive(CONFUSION, state);
    const ordinaryScroll = scroll.oclass === SCROLL_CLASS
        && !scroll.blessed && !scroll.cursed && scroll.dknown
        && !propertyActive(BLINDED, state) && !confused
        && can_chant(state.youmonst, state);
    const mapping = ordinaryScroll
        && scroll.otyp === SCR_MAGIC_MAPPING
        && objectType(scroll, state).oc_name_known
        && !state.level?.flags?.nommap
        && state.level?.flags?.hero_memory
        && !Is_special(state.u?.uz, state)
        && !state.u?.uinwater && !state.u?.uburied && !state.u?.uswallow;
    const identify = ordinaryScroll
        && scroll.otyp === SCR_IDENTIFY
        && !objectType(scroll, state).oc_name_known
        && scroll.quan === 1;
    const destroyArmor = ordinaryScroll
        && scroll.otyp === SCR_DESTROY_ARMOR
        && !objectType(scroll, state).oc_name_known
        && oneWornFlammableArmor(state);
    // C doread() admits a visible light scroll while confused; ordinaryScroll
    // intentionally excludes confusion because its other arms need calm
    // preconditions. Keep this separate so seffect_light() reaches both
    // source branches through the production caller.
    const light = scroll.oclass === SCROLL_CLASS
        && scroll.otyp === SCR_LIGHT
        && !propertyActive(BLINDED, state)
        && can_chant(state.youmonst, state);
    const enchantWeapon = ordinaryScroll
        && scroll.otyp === SCR_ENCHANT_WEAPON
        && !propertyActive(HALLUC, state)
        && state.uwep
        && (state.uwep.oclass === WEAPON_CLASS
            || is_weptool(state.uwep, state))
        && !state.uwep.oartifact
        && !state.uwep.oeroded && !state.uwep.oeroded2
        && state.uwep.spe <= 5;
    const knownHealing = scroll.oclass === SPBOOK_CLASS
        && !propertyActive(BLINDED, state) && !confused
        && study_book_preflight(scroll, state);
    const tooHardBook = tooHardSpellbookPreflight(scroll, state);
    const confusedTeleport = scroll.oclass === SCROLL_CLASS
        && scroll.otyp === SCR_TELEPORTATION
        && scroll.blessed && !scroll.cursed
        && !propertyActive(BLINDED, state)
        && confused && !propertyActive(HALLUC, state)
        && can_chant(state.youmonst, state) && state.wizard;
    const calmTeleport = ordinaryScroll
        && scroll.otyp === SCR_TELEPORTATION;
    const removeCurse = scroll.oclass === SCROLL_CLASS
        && scroll.otyp === SCR_REMOVE_CURSE && scroll.cursed
        && !propertyActive(BLINDED, state)
        && can_chant(state.youmonst, state);
    const punishment = punishmentReadAdmitted(scroll, confused, state);
    if (!mapping && !identify && !destroyArmor && !light
        && !knownHealing && !tooHardBook
        && !enchantWeapon
        && !confusedTeleport && !calmTeleport && !removeCurse
        && !punishment) {
        throw new UnsupportedReadError('the selected readable object branch');
    }

    scroll.pickup_prev = false;
    state.u.uconduct ??= {};
    // C doread()'s generic readable-object arm (read.c:598-604) logs the
    // first literacy conduct before incrementing it. The supported reader
    // arms above all land here for an ordinary scroll or spellbook, while
    // winning-game books and blank paper are excluded exactly as in C.
    const countsLiteracy = scroll.otyp !== SPE_BOOK_OF_THE_DEAD
        && scroll.otyp !== SPE_NOVEL
        && scroll.otyp !== SPE_BLANK_PAPER
        && scroll.otyp !== SCR_BLANK_PAPER;
    if (countsLiteracy && !state.u.uconduct.literate) {
        const readable = scroll.oclass === SPBOOK_CLASS ? 'a book'
            : scroll.oclass === SCROLL_CLASS ? 'a scroll' : 'something';
        livelog_printf(
            LL_CONDUCT,
            `became literate by reading ${readable}`,
            state,
        );
    }
    state.u.uconduct.literate
        = Math.trunc(state.u.uconduct.literate ?? 0) + 1;
    if (knownHealing) {
        return await study_book(scroll, state, {
            message: ttyPline,
            prompt: y_n,
        }) ? ECMD_TIME : ECMD_OK;
    }
    if (tooHardBook) {
        return await studyTooHardSpellbook(scroll, state)
            ? ECMD_TIME : ECMD_OK;
    }
    scroll.in_use = true;
    // C ref: read.c doread() (614-626). Some scroll effects describe
    // something happening to the scroll itself, so avoid "it disappears"
    // for those.
    const nodisappear = scroll.otyp === SCR_REMOVE_CURSE && scroll.cursed;
    await ttyPline(
        nodisappear
            ? 'You read the scroll.'
            : 'As you read the scroll, it disappears.',
        state,
    );
    if (confused) {
        await ttyPline(
            `Being confused, you ${can_chant(state.youmonst, state)
                ? 'mispronounce' : 'misunderstand'} the magic words...`,
            state,
        );
    }
    const consumedByEffect = await seffects(scroll, state);
    if (!consumedByEffect) {
        if (!objectType(scroll, state).oc_name_known) {
            if (state.gk.known) {
                learnscrolltyp(scroll.otyp, state);
            } else {
                await trycall(scroll, state);
            }
        }
        scroll.in_use = false;
        useup(scroll, { state, hooks: {} });
    }
    return ECMD_TIME;
}

// C ref: read.c seffect_destroy_armor() (1324-1396). Covers the ordinary,
// uncursed and unblessed fallback that calls do_wear.c destroy_arm().
// some_armor() is deliberately called before destroy_arm(), as in C; the
// single worn suit in this slice means that selection has no random draw.
export async function seffect_destroy_armor(scroll, state = game) {
    if (scroll.otyp !== SCR_DESTROY_ARMOR
        || scroll.oclass !== SCROLL_CLASS
        || scroll.blessed || scroll.cursed
        || objectType(scroll, state).oc_name_known
        || propertyActive(CONFUSION, state)
        || propertyActive(BLINDED, state)
        || !can_chant(state.youmonst, state)
        || !oneWornFlammableArmor(state)) {
        throw new UnsupportedReadError(
            'the selected destroy-armor fallback branch',
        );
    }
    if (!some_armor(state.youmonst, state, { rn2 })) {
        throw new UnsupportedReadError(
            'destroy-armor with no selected armor',
        );
    }
    if (!await destroy_arm(state, { rn2, rnl })) {
        throw new UnsupportedReadError(
            'destroy-armor with no effective erosion',
        );
    }
    state.gk.known = true;
}

// C ref: read.c seffect_remove_curse() (1489-1605). Only the cursed-scroll
// branch (lines 1505-1506) is ported: it prints the You_feel message and
// "The scroll disintegrates." and skips the uncursed/blessed invent-traversal
// loop. The function never nulls sobjp, so seffects() returns 0 and the
// caller handles useup.
export async function seffect_remove_curse(scroll, state = game) {
    if (scroll.otyp !== SCR_REMOVE_CURSE || !scroll.cursed) {
        throw new UnsupportedReadError(
            'the selected remove-curse branch',
        );
    }
    const confused = propertyActive(CONFUSION, state);
    const halluc = propertyActive(HALLUC, state);
    // C ref: pline.c You_feel() prepends "You feel " (or "You dream that
    // you feel " when Unaware, which cannot happen while reading).
    await ttyPline(
        'You feel '
        + (!halluc
            ? (!confused ? 'like someone is helping you.'
                : 'like you need some help.')
            : (!confused ? 'in touch with the Universal Oneness.'
                : 'the power of the Force against you!')),
        state,
    );
    await ttyPline('The scroll disintegrates.', state);
    update_inventory({ state });
}

// C ref: read.c seffect_teleportation() (2015-2032). Re-read the live
// confusion property here, after both reading messages, as C does. The calm
// ordinary scrolltele() branch reaches teleport.c's uncontrolled safe_teleds
// path; confused or cursed scrolls retain the level_tele() branch.
export async function seffect_teleportation(scroll, state = game) {
    const scursed = Boolean(scroll.cursed);
    const confused = propertyActive(CONFUSION, state);
    if (confused || scursed) {
        await level_tele(state);
        /* gives "materialize on different/same level!" message, must
           be a teleport scroll */
        state.gk.known = true;
        return;
    }
    await scrolltele(scroll, state);
}

// C ref: read.c learnscroll() (68-76). teleport.c:scrolltele() calls this
// immediately before its uncontrolled teleport attempt; spellbooks are not
// scrolls and are deliberately ignored here.
export function learnscroll(scroll, state = game) {
    if (scroll.oclass !== SPBOOK_CLASS)
        learnscrolltyp(scroll.otyp, state);
}

// C ref: read.c learnscrolltyp() (58-68).
export function learnscrolltyp(scrolltyp, state = game) {
    if (!state.objects[scrolltyp].oc_name_known) {
        discover_object(scrolltyp, true, true, true, state, {
            random: { rn2 }, hooks: {},
        });
        more_experienced(0, 10, state);
        return true;
    }
    return false;
}

// C ref: read.c seffect_identify() (2055-2099), restricted to an unknown,
// sighted, unconfused, unblessed, uncursed identify scroll. Both ordinary-scroll
// rn2(5) outcomes are retained because the zero result spends a second rn2(5).
export async function seffect_identify(scroll, state = game) {
    if (scroll.otyp !== SCR_IDENTIFY || scroll.oclass !== SCROLL_CLASS
        || scroll.blessed || scroll.cursed
        || objectType(scroll, state).oc_name_known
        || scroll.quan !== 1) {
        throw new UnsupportedReadError('the selected identify-scroll branch');
    }

    useup(scroll, { state, hooks: {} });
    await ttyPline('This is an identify scroll.', state);
    learnscrolltyp(SCR_IDENTIFY, state);

    let cval = 1;
    if (rn2(5) === 0) cval = rn2(5);
    await identify_pack(cval, true, state);
}

// C ref: read.c set_lit() (2471-2488).  The callback keeps the permanent
// terrain lighting in level.map and records gremlins for litroom()'s delayed
// light damage.  Mobile object sources are removed by the same coordinate
// check as light.c snuff_light_source().
function set_lit(x, y, lit, state, gremlins) {
    if (!isok(x, y)) return;
    const location = state.level?.at(x, y);
    if (!location) return;
    if (lit) {
        location.lit = true;
        const monster = m_at(x, y, state);
        if (monster?.data?.pmidx === PM_GREMLIN)
            gremlins.push(monster);
        return;
    }
    location.lit = false;
    // C's snuff_light_source() only removes an object source and leaves
    // artifact light alone.  Deleting through light.js preserves its list
    // ownership and vision invalidation contract.
    for (let source = state.gl?.light_base ?? null; source;) {
        const next = source.next;
        if (source.type === LS_OBJECT && source.x === x && source.y === y
            && source.id?.lamplit && !artifact_light(source.id)) {
            try {
                del_light_source(source.type, source.id, state);
            } catch {
                // A stale source is already equivalent to C's absent source.
            }
        }
        source = next;
    }
}

// C ref: read.c litroom() (2491-2634), for the light-scroll call.  The map
// callback, rogue-room exception, redraw sequencing, and no-op water/swallow
// guard follow the source.  Artifact-light BUC transitions belong to
// artifact.c impact_arti_light(); those objects remain lit here, as C's
// artifact branch does when that helper elects not to extinguish them.
async function litroom(on, object, state) {
    const blessedEffect = Boolean(
        object && object.oclass === SCROLL_CLASS && object.blessed,
    );
    const swallowed = Boolean(state.u?.uswallow);
    const noOp = swallowed || Boolean(state.u?.uinwater)
        || Is_waterlevel(state.u?.uz);
    const gremlins = [];

    if (!on) {
        let stillLit = 0;
        for (let current = state.invent; current; current = current.nobj) {
            if (!current.lamplit) continue;
            if (!artifact_light(current)) {
                current.lamplit = false;
                for (let source = state.gl?.light_base ?? null; source;) {
                    const next = source.next;
                    if (source.type === LS_OBJECT && source.id === current) {
                        try {
                            del_light_source(source.type, source.id, state);
                        } catch {
                            // The source can already have gone stale.
                        }
                    }
                    source = next;
                }
            }
            if (current.lamplit) ++stillLit;
        }
        if (!propertyActive(BLINDED, state)) {
            if (stillLit) await ttyPline('The ambient light seems dimmer.', state);
            else if (swallowed) {
                await ttyPline('It seems even darker in here than before.', state);
            } else {
                await ttyPline('You are surrounded by darkness!', state);
            }
        }
    } else {
        if (swallowed) {
            if (!propertyActive(BLINDED, state)) {
                const engulfer = state.u.ustuck;
                const name = engulfer ? Monnam(engulfer, state) : 'It';
                if (engulfer?.data && is_whirly(engulfer.data)) {
                    await ttyPline(`${name} shines briefly.`, state);
                } else if (engulfer?.data) {
                    await ttyPline(`${name} glistens.`, state);
                }
            }
        } else if (!propertyActive(BLINDED, state)
            && (!Is_rogue_level(state.u?.uz)
                || state.level?.at(state.u.ux, state.u.uy)?.typ !== CORR)) {
            await ttyPline(
                `A lit field ${noOp ? 'briefly ' : ''}surrounds you!`, state,
            );
        }
    }

    if (noOp) return;

    if (Is_rogue_level(state.u?.uz)) {
        const roomNumber = (state.level.at(state.u.ux, state.u.uy)?.roomno ?? 0)
            - ROOMOFFSET;
        const room = state.level.rooms?.[roomNumber];
        if (room) {
            for (let x = room.lx - 1; x <= room.hx + 1; ++x) {
                for (let y = room.ly - 1; y <= room.hy + 1; ++y)
                    set_lit(x, y, on, state, gremlins);
            }
            room.rlit = Boolean(on);
        }
    } else if (object?.oartifact === ART_SUNSWORD) {
        // A scroll can never reach this arm through doread(), but
        // seffect_light() keeps the source test for direct callers and source
        // parity.
        set_lit(state.u.ux, state.u.uy, true, state, gremlins);
    } else {
        do_clear_area(
            state.u.ux, state.u.uy, blessedEffect ? 9 : 5,
            (x, y, value) => set_lit(x, y, value, state, gremlins),
            on ? true : null,
            state,
        );
    }

    if (!propertyActive(BLINDED, state)) {
        vision_recalc(2, {
            state,
            redraw: (x, y) => newsym(x, y),
        });
    }
    state.vision_full_recalc = 1;

    // C drains the temporary gremlin list after the delayed vision pass. The
    // complete wake/killed-monster lifecycle is owned by uhitm.c; this path
    // still applies the source damage and removes a dead map occupant.
    for (const monster of gremlins) {
        if (monster.mhp < 1) continue;
        const damage = rnd(5);
        monster.mhp -= damage;
        if (monster.mhp < 1) {
            monster.mhp = 0;
            if (m_at(monster.mx, monster.my, state) === monster)
                state.level.monsters[monster.mx][monster.my] = null;
        }
    }
}

// C ref: read.c seffect_light() (1741-1785).  This is the complete source
// branch: calm scrolls illuminate or darken the room and can hurt a gremlin;
// confused scrolls surround the hero with cancelled tame yellow/black
// lights, including the genocide fallback and visibility knowledge update.
export async function seffect_light(scroll, state = game) {
    if (scroll?.otyp !== SCR_LIGHT || scroll.oclass !== SCROLL_CLASS)
        throw new UnsupportedReadError('the selected light-scroll branch');
    state.gk ??= {};
    const blessed = Boolean(scroll.blessed);
    const cursed = Boolean(scroll.cursed);
    const confused = propertyActive(CONFUSION, state);

    if (!confused) {
        if (!propertyActive(BLINDED, state)) state.gk.known = true;
        await litroom(!cursed, scroll, state);
        if (!cursed && await lightdamage(scroll, true, 5, state))
            state.gk.known = true;
        return;
    }

    const pm = cursed ? PM_BLACK_LIGHT : PM_YELLOW_LIGHT;
    const vital = (state.svm?.mvitals ?? state.mvitals)?.[pm];
    if ((vital?.mvflags ?? 0) & G_GONE) {
        await ttyPline('Tiny lights sparkle in the air momentarily.', state);
        return;
    }
    const numLights = rn1(2, 3) + (blessed ? 2 : 0);
    let sawLights = false;
    for (let i = 0; i < numLights; ++i) {
        const monster = await makemon_runtime(
            state.mons[pm], state.u.ux, state.u.uy,
            MM_EDOG | NO_MINVENT | MM_NOMSG,
            { state },
        );
        if (!monster) continue;
        initedog(monster, true, { state });
        monster.msleeping = false;
        monster.mcan = true;
        if (canSpotMonster(monster, state)) sawLights = true;
        newsym(monster.mx, monster.my);
    }
    if (sawLights) {
        await ttyPline('Lights appear all around you!', state);
        state.gk.known = true;
    }
}

// C ref: read.c seffect_magic_mapping() (2102-2153), restricted to an
// ordinary uncursed scroll on a mappable level.
export async function seffect_magic_mapping(scroll, state = game) {
    if (scroll.otyp !== SCR_MAGIC_MAPPING || scroll.blessed || scroll.cursed
        || state.level?.flags?.nommap) {
        throw new UnsupportedReadError('the selected magic-mapping branch');
    }
    state.gk.known = true;
    await ttyPline('A map coalesces in your mind!', state);
    notice_mon_off(state);
    try {
        await do_mapping(state);
    } finally {
        notice_mon_on(state);
    }
}

// C ref: read.c seffects() (2194-2290), restricted to SCR_IDENTIFY,
// SCR_DESTROY_ARMOR, SCR_ENCHANT_WEAPON, SCR_MAGIC_MAPPING,
// SCR_REMOVE_CURSE, SCR_TELEPORTATION and SCR_PUNISHMENT. C returns `sobj ? 0 : 1`:
// 0 when the scroll still exists (caller handles useup), 1 when the effect
// consumed it.  seffect_remove_curse(), seffect_teleportation(), and
// seffect_magic_mapping() never consume the scroll, so those paths return 0.
export async function seffects(scroll, state = game) {
    if (scroll.otyp !== SCR_MAGIC_MAPPING && scroll.otyp !== SCR_IDENTIFY
        && scroll.otyp !== SCR_DESTROY_ARMOR
        && scroll.otyp !== SCR_ENCHANT_WEAPON
        && scroll.otyp !== SCR_REMOVE_CURSE
        && scroll.otyp !== SCR_TELEPORTATION
        && scroll.otyp !== SCR_PUNISHMENT
        && scroll.otyp !== SCR_LIGHT) {
        throw new UnsupportedReadError('the selected scroll effect');
    }
    state.gk ??= {};
    if (objectType(scroll, state).oc_magic)
        await exercise(A_WIS, true, state, { rn2 });
    if (scroll.otyp === SCR_IDENTIFY) {
        await seffect_identify(scroll, state);
        update_inventory({ state });
        return 1;
    }
    if (scroll.otyp === SCR_DESTROY_ARMOR) {
        await seffect_destroy_armor(scroll, state);
        return 0;
    }
    if (scroll.otyp === SCR_ENCHANT_WEAPON) {
        await seffect_enchant_weapon(scroll, state);
        return 0;
    }
    if (scroll.otyp === SCR_REMOVE_CURSE) {
        await seffect_remove_curse(scroll, state);
        return 0;
    }
    if (scroll.otyp === SCR_TELEPORTATION) {
        await seffect_teleportation(scroll, state);
        return 0;
    }
    if (scroll.otyp === SCR_PUNISHMENT) {
        await seffect_punishment(scroll, state);
        return 0;
    }
    if (scroll.otyp === SCR_LIGHT) {
        await seffect_light(scroll, state);
        return 0;
    }
    await seffect_magic_mapping(scroll, state);
    return 0;
}

// C ref: read.c seffect_enchant_weapon() (1627-1676), restricted to the
// ordinary uncursed positive branch. The source chooses `s = 1` below its
// soft upper limit, passes that value to wield.c chwepon(), and leaves the
// scroll for doread() to consume after the effect returns.
export async function seffect_enchant_weapon(scroll, state = game) {
    const uwep = state.uwep;
    if (scroll.otyp !== SCR_ENCHANT_WEAPON
        || scroll.oclass !== SCROLL_CLASS
        || scroll.blessed || scroll.cursed
        || propertyActive(CONFUSION, state)
        || propertyActive(BLINDED, state)
        || propertyActive(HALLUC, state)
        || !uwep
        || (uwep.oclass !== WEAPON_CLASS && !is_weptool(uwep, state))
        || uwep.oartifact || uwep.oeroded || uwep.oeroded2
        || uwep.spe > 5
        || !can_chant(state.youmonst, state)) {
        throw new UnsupportedReadError(
            'the selected ordinary enchant-weapon branch',
        );
    }
    await chwepon(scroll, 1, state);
    if (state.uwep && Math.abs(state.uwep.spe) > SPE_LIM)
        state.uwep.spe = Math.sign(state.uwep.spe) * SPE_LIM;
}

// A request the player typed that read.c understands and this port does not.
// Every raiser is a branch of one of the four functions below, named in the
// message. js/cmd.js failClosedCommandRefusals() lists the class, because the
// prompt has already echoed the whole typed line by the time one is raised.
export class UnsupportedMonsterRequestError extends Error {
    constructor(operation) {
        super(`unsupported monster request: ${operation}`);
        this.name = 'UnsupportedMonsterRequestError';
        this.operation = operation;
    }
}

// C ref: read.c cant_revive() (3111-3134).
//
// C answers through an `int *mtype` the caller owns; JavaScript has no such
// pointer, so the substituted species comes back beside the boolean as
// `{ changed, mtype }`. All four of C's callers read both halves:
// bones.c:156, trap.c:746, read.c:3262 and zap.c:982.
//
// `from_obj` is the corpse or statue a revival came from, and only the
// unique-species arm looks at it. A unique corpse with saved monster traits is
// allowed to revive as itself; without them it becomes a doppelganger.
export function cant_revive(mtype, revival, from_obj, state = game) {
    /* SHOPKEEPERS can be revived now */
    if (mtype === PM_GUARD || (mtype === PM_SHOPKEEPER && !revival)
        || mtype === PM_HIGH_CLERIC || mtype === PM_ALIGNED_CLERIC
        || mtype === PM_ANGEL) {
        return { changed: true, mtype: PM_HUMAN_ZOMBIE };
    } else if (mtype === PM_LONG_WORM_TAIL) { /* for create_particular() */
        return { changed: true, mtype: PM_LONG_WORM };
    } else if (unique_corpstat(state.mons?.[mtype])
        && (!from_obj || !from_obj.oextra?.omonst)) {
        /* unique corpses (from bones or wizard mode wish) or
           statues (bones or any wish) end up as shapechangers */
        return { changed: true, mtype: PM_DOPPELGANGER };
    }
    return { changed: false, mtype };
}

// read.c:3162, whose comment at 3163-3164 gives the reason: the most the
// command will make is one monster per map cell, (0..ROWNO-1) x (1..COLNO-1).
const QUAN_LIMIT = ROWNO * (COLNO - 1);

// The six words read.c:3169-3193 searches the whole answer for, in source
// order. Each sets a request field that decides how the monster arrives, and
// the arm that finds one blanks the word out of the buffer before the species
// lookup sees it. "female" is searched for before "male" so that the second
// search cannot hit the tail of the first.
const GEAR_AND_STATE_WORDS = Object.freeze([
    'saddled ', 'sleeping ', 'invisible ', 'hidden ', 'female ', 'male ',
]);

// The three disposition prefixes at read.c:3197-3206, each of which decides
// how the created monster feels about the hero.
const DISPOSITION_PREFIXES = Object.freeze(['tame ', 'peaceful ', 'hostile ']);

// C ref: read.c create_particular_parse() (3136-3249).
//
// Covers the plain-monster-name arm and nothing else: the answer reaches
// name_to_mon() at 3212 and returns at 3230 with `which` set. Every arm that
// would qualify the request first -- a leading count, the six gear, state and
// gender words, the three disposition prefixes and the wizard-only "*" -- is
// refused above it, and so is name_to_monclass() below it, which
// js/mondata.js:1181 records as unported.
//
// C fills a caller-owned struct and answers whether it found a monster. This
// returns the filled request instead, because the only other answer it can
// give is the refusal above.
export function create_particular_parse(str, state = game) {
    let bufp = str;
    const d = {
        quan: 1 + ((state.multi > 0) ? state.multi : 0),
        monclass: MAXMCLASSES,
        which: state.urole.mnum, /* an arbitrary index into mons[] */
        fem: -1,            /* gender not specified */
        genderconf: -1,     /* no confusion on which gender to assign */
        randmonst: false,
        maketame: false,
        makepeaceful: false,
        makehostile: false,
        sleeping: false,
        saddled: false,
        invisible: false,
        hidden: false,
    };

    /* quantity */
    if (digit(bufp[0])) {
        throw new UnsupportedMonsterRequestError(
            'create_particular_parse() count prefix',
        );
    }
    // read.c:3165-3166 replaces an out-of-range quantity with however many
    // monsters the map can still hold, which needs monster_census(). With the
    // digit arm above refused, gm.multi is the only thing left that can move
    // the quantity, and it can only raise it, so C's `d->quan < 1` half has
    // nothing that reaches it here.
    //
    // gm.multi cannot reach this line either. js/cmd.js:2128 refuses a
    // positive count with COUNTED_BOUNDARY before the extended command
    // dispatches, so `3^G` ends the segment without opening the prompt, and
    // d.quan is 1 on every call the running game makes. The refusal below,
    // the creation loop's second and later iterations and its break are all
    // fail-closed guards mirroring C rather than live branches.
    if (d.quan > QUAN_LIMIT) {
        throw new UnsupportedMonsterRequestError('monster_census()');
    }
    for (const word of GEAR_AND_STATE_WORDS) {
        if (strstri(bufp, word) >= 0) {
            throw new UnsupportedMonsterRequestError(
                `create_particular_parse() "${word}"`,
            );
        }
    }
    bufp = mungspaces(bufp); /* after potential memset(' ') */
    /* allow the initial disposition to be specified */
    for (const prefix of DISPOSITION_PREFIXES) {
        // C's `!strncmpi(bufp, prefix, strlen(prefix))`: a case-insensitive
        // search finds the word at offset 0 exactly when it is a prefix.
        if (strstri(bufp, prefix) === 0) {
            throw new UnsupportedMonsterRequestError(
                `create_particular_parse() "${prefix}"`,
            );
        }
    }
    /* decide whether a valid monster was chosen */
    if (state.wizard && (bufp === '*' || bufp === 'random')) {
        throw new UnsupportedMonsterRequestError(
            'create_particular_parse() random monster',
        );
    }
    // C's `d->which = name_to_mon(bufp, &gender_name_var)`. name_to_mon()
    // discards name_to_monplus()'s remainder and passes the gender pointer
    // through, so the port calls name_to_monplus() directly: the gender the
    // matched name carries is the second half of this line's result, and
    // js/mondata.js name_to_mon() has no way to hand it back.
    //
    // `gender_name_var` starts at NEUTRAL, as read.c:3141 does, rather than at
    // the -1 js/mondata.js defaults to. The seed is not what makes a neuter
    // pmname answer NEUTRAL: mondata.c:1078-1082 writes the matched gender
    // through the pointer whenever a pmname matched at all, and js/mondata.js
    // mirrors it, so "gas spore" answers NEUTRAL under either seed. The seed
    // is observable only where no pmname matched and there is no gender to
    // write -- the title_to_mon() fallback at mondata.c:1074, whose own FIXME
    // at 1073 says titles carry no gender, and the no-match case. There C
    // leaves d->fem at the NEUTRAL it started at and an unseeded call would
    // leave it at -1.
    const named = name_to_monplus(bufp, { state, gender: NEUTRAL });
    d.which = named.mnum;
    /*
     * With the introduction of male and female monster names
     * in 5.0, preserve that detail.
     *
     * C tests `d->fem == MALE || d->fem == FEMALE` here, which is how an
     * explicit "male " or "female " word overrides the gender the name
     * carries and how d->genderconf is raised. Both words are refused above,
     * so d->fem is still -1 and only C's else arm has an owner.
     */
    d.fem = named.gender;
    if (ismnum(d.which))
        return d; /* got one */
    throw new UnsupportedMonsterRequestError('mondata.c name_to_monclass()');
}

// C ref: read.c create_particular_creation() (3251-3357).
//
// Covers the named-species arm: cant_revive() answering FALSE, one loop
// iteration whose mmflags is MM_NOEXCLAM plus whatever gender the typed name
// carried, and makemon() on the hero's own square. Everything the loop does
// with the monster afterwards -- tamedog(), set_malign(), put_saddle_on_mon(),
// the mundetected and msleeping assignments and flash_mon() -- is guarded by a
// request field create_particular_parse() refuses, so none of it has an owner.
async function create_particular_creation(d, state = game) {
    let madeany = false;

    /* d.randmonst is always FALSE: the arm that raises it is refused in parse,
       so C's `if (!d->randmonst)` guard is always taken. */
    const firstchoice = d.which;
    const revived = cant_revive(d.which, false, null, state);
    if (revived.changed && firstchoice !== PM_LONG_WORM_TAIL) {
        /* wizard mode can override handling of special monsters */
        throw new UnsupportedMonsterRequestError(
            'create_particular_creation() force-the-species prompt',
        );
    }
    d.which = revived.mtype;
    const whichpm = state.mons[d.which];

    for (let i = 0; i < d.quan; i++) {
        let mmflags = NO_MM_FLAGS;

        /* d.monclass is always MAXMCLASSES and d.randmonst always FALSE, so
           mkclass() and rndmonst() never reselect whichpm, and whichpm is
           never the null C's gender test below guards against. */
        /* d.genderconf is always -1: the conflict it records needs an explicit
           gender word, and parse refuses those. */
        if (d.fem !== -1 && !is_male(whichpm) && !is_female(whichpm)) {
            mmflags |= (d.fem === FEMALE) ? MM_FEMALE
                : (d.fem === MALE) ? MM_MALE : 0;
        }
        /* no surprise; "<mon> appears." rather than "<mon> appears!" */
        mmflags |= MM_NOEXCLAM;

        const mtmp = await makemon_runtime(
            whichpm, state.u.ux, state.u.uy, mmflags, { state },
        );
        if (!mtmp) {
            /* quit trying if creation failed and is going to repeat. C tests
               `d->monclass == MAXMCLASSES && !d->randmonst` before breaking
               and retries otherwise, to give mkclass() or rndmonst() another
               draw; both terms are constant here, because parse refuses every
               arm that could move either, so the retry has no owner. */
            break;
        }
        madeany = true;
        /* C's newcham() tail turns a doppelganger cant_revive() substituted
           back into the species the player asked for. It has no owner here:
           the one substitution parse and the guard above let through is
           PM_LONG_WORM_TAIL becoming PM_LONG_WORM, and a long worm's
           mtmp->cham is NON_PM. */
    }
    return madeany;
}

// C ref: read.c create_particular() (3371-3408).
//
// Covers the first pass of C's `do { ... } while (--tryct > 0)` loop and the
// `return create_particular_creation(&d)` at 3405 that it leaves by. The retry
// arms at 3390-3403 -- "I've never heard of such monsters." at 3392, "Try
// again (type * for random, ESC to cancel)." at 3394, the
// " [type name or symbol]" prompt extension at 3398-3399 and
// thats_enough_tries at 3403 -- have no owner, because
// create_particular_parse() refuses an answer it cannot use rather than
// answering FALSE, so no second pass can start.
export async function create_particular(state = game) {
    const buf = await getlin('Create what kind of monster?', state);
    const bufp = mungspaces(buf);
    if (bufp[0] === '\x1B')
        return false;

    const d = create_particular_parse(bufp, state);
    return create_particular_creation(d, state);
}
