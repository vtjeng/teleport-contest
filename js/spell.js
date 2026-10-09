// Runtime spell-memory upkeep, the known-spell display, and spell casting.
// C ref: spell.c age_spells(), dovspell(), dospellmenu(), percent_success(),
// spell_cmp(), sortspells(), spellsortmenu(), show_spells(),
// spellretention(), spelltypemnemonic(), study_book(), docast(), getspell(),
// spell_backfire(), spelleffects_check(), spelleffects(), rejectcasting(), spell_let_to_idx(),
// and spell_idx().

import {
    A_INT,
    DISP_CHANGE, D_CLOSED, D_LOCKED, SPACE_POS, POOL, MOAT,
    DRAWBRIDGE_UP, LAVAPOOL, SHOCK_RES, HALLUC, HALLUC_RES,
    N_DIRS, xdir, ydir, XKILL_GIVEMSG,
    A_STR,
    A_WIS,
    EYE,
    FACE,
    HEAD,
    ACH_INVK,
    ACH_NOVL,
    ANTIMAGIC,
    CLAIRVOYANT,
    CMDQ_KEY,
    CONFUSION,
    BLINDED,
    CLOUD, IS_TREE,
    ERODE_CORRODE,
    EF_GREASE,
    EF_VERBOSE,
    ECMD_FAIL,
    DISP_BEAM, DISP_END, D_ISOPEN, IS_DOOR, IS_STWALL, Is_waterlevel, ZAP_POS, EXPL_FIERY, EXPL_FROSTY,
    ECMD_OK,
    ECMD_TIME,
    HALF_PHDAM,
    LL_CONDUCT,
    MAX_SPELL_STUDY,
    NO_KILLER_PREFIX,
    NO_SPELL,
    NO_MINVENT,
    nothing_happens,
    P_ATTACK_SPELL,
    P_BASIC,
    P_CLERIC_SPELL,
    P_DIVINATION_SPELL,
    P_ENCHANTMENT_SPELL,
    P_ESCAPE_SPELL,
    P_EXPERT,
    P_HEALING_SPELL,
    P_MATTER_SPELL,
    P_SKILLED,
    P_UNSKILLED,
    PICK_NONE,
    PICK_ONE,
    POISON_RES,
    SLEEP_RES,
    SICK,
    SLIMED,
    SPINE,
    STUNNED,
    TIMEOUT,
    uhim,
} from './const.js';
import { acurr, exercise } from './attrib.js';
import { jump } from './apply.js';
import { cmdq_pop, getdir, set_occupation } from './cmd.js';
import { morehungry } from './eat.js';
import { more_experienced, newexplevel } from './exper.js';
import { read_tribute } from './files.js';
import { makeplural } from './fruit.js';
import { freehand } from './engrave.js';
import { game } from './gstate.js';
import { shieldeff, cmap_to_glyph, map_glyphinfo, tmp_at, canspotmon, zapdir_to_glyph, map_invisible } from './display.js';
import { check_capacity, invocation_pos, losehp, nomul, nh_delay_output } from './hack.js';
import { dist2, distmin, isqrt, sgn, strncmpi } from './hacklib.js';
import { obfree, update_inventory, useup } from './invent.js';
import {
    can_chant,
    Resists_Elem, defended,
    haseyes,
    is_undead,
    is_vampshifter,
    is_whirly, is_animal, dmgtype_fromattack,
} from './mondata.js';
import {
    AD_ELEC,
    PM_CYCLOPS,
    PM_FLOATING_EYE,
    PM_FOG_CLOUD, AD_WRAP, AT_ENGL,
    PM_KNIGHT,
    PM_MASTER_LICH,
    PM_NALFESHNEE,
    PM_WIZARD,
} from './monsters.js';
import {
    isMetallic, mksobj, objectType, set_bknown, weight,
} from './obj.js';
import { Tobjnam, an } from './objnam.js';
import { check_unpaid } from './shk.js';
import {
    MAXSPELL,
    NODIR,
    OBJ_DESCR,
    OBJ_NAME,
    QUARTERSTAFF,
    ROBE,
    SMALL_SHIELD,
    SPE_CHAIN_LIGHTNING,
    SPE_CAUSE_FEAR,
    SPE_CANCELLATION,
    SPE_CLAIRVOYANCE,
    SPE_CONE_OF_COLD,
    SPE_CURE_BLINDNESS,
    SPE_CURE_SICKNESS,
    SPE_CHARM_MONSTER,
    SPE_CONFUSE_MONSTER,
    SPE_CREATE_MONSTER,
    SPE_CREATE_FAMILIAR,
    SPE_DETECT_FOOD,
    SPE_DETECT_MONSTERS,
    SPE_DETECT_TREASURE,
    SPE_DETECT_UNSEEN,
    SPE_DIG,
    SPE_DRAIN_LIFE,
    SPE_EXTRA_HEALING,
    SPE_FINGER_OF_DEATH,
    SPE_FIREBALL,
    SPE_FORCE_BOLT,
    SPE_HASTE_SELF,
    SPE_HEALING,
    SPE_BOOK_OF_THE_DEAD,
    SPE_BLANK_PAPER,
    SPE_IDENTIFY,
    SPE_MAGIC_MAPPING,
    BELL_OF_OPENING,
    CANDELABRUM_OF_INVOCATION,
    SPE_INVISIBILITY,
    SPE_JUMPING,
    SPE_KNOCK,
    SPE_LEVITATION,
    SPE_LIGHT,
    SPE_MAGIC_MISSILE,
    SPE_POLYMORPH,
    SPE_PROTECTION,
    SPE_REMOVE_CURSE,
    SPE_RESTORE_ABILITY,
    SPE_SLEEP,
    SPE_SLOW_MONSTER,
    SPE_STONE_TO_FLESH,
    SPE_TELEPORT_AWAY,
    SPE_TURN_UNDEAD,
    SPE_WIZARD_LOCK,
    CORNUTHAUM,
    SPE_NOVEL,
    LENSES,
} from './objects.js';
import { d, rn1, rn2, rnd, rne, rnl, rnz, rn2_on_display_rng } from './rng.js';
import { aggravate } from './wizard.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { livelog_printf } from './pline.js';
import {
    P_SKILL,
    SPELL_KNOWLEDGE_KEEN,
    num_spells,
    spell_skilltype,
} from './startup_skills.js';
import {
    healup, make_blinded, make_confused, make_stunned, make_slimed, peffects,
} from './potion.js';
import { discover_object, observe_object } from './o_init.js';
import { do_vicinity_map } from './detect.js';
import { use_skill } from './weapon.js';
import { unturn_dead, zapyourself, weffects, spell_damage_bonus, zhitm, exclam } from './zap.js';
import { fall_asleep } from './timeout.js';
import { erode_obj } from './trap_erode_obj.js';
import { body_part } from './polyself.js';
import { cansee } from './vision.js';
import { On_stairs } from './stairs.js';
import { make_familiar, tamedog } from './dog.js';
import { set_malign } from './makemon.js';
import { makemon_runtime } from './makemon_create.js';
import { mkundead } from './mkroom.js';
import { iter_mons_async, wakeup, xkilled } from './mon.js';
import { monflee, monfleeMessage, youHear } from './monmove.js';
import { noveltitle, hcolor, hliquid, mon_nam, Monnam } from './do_name.js';
import { heroIsBlind } from './startup_a11y.js';
import { find_ac } from './u_init_inventory_attrs.js';
import { note_unported } from './unported.js';
// C spell.c:spelleffects() passes scroll-duplicate fake spellbooks to
// read.c:seffects(). read.js imports study_book() from this module; both
// bindings are used only inside function bodies, so the cycle is deferred
// until gameplay.
import { seffects } from './read.js';
import { canseemon } from './display.js';
import { getpos, getpos_sethilite } from './getpos.js';
import { isok } from './cmd_isok.js';
import { m_at } from './monst.js';
import { walk_path } from './dothrow.js';
import { explode } from './explode.js';
import { clearTtyMessageWindow } from './tty_message.js';
import { S_goodpos } from './symbols.js';

// C ref: spell.c's spellmenu arguments. 0..MAXSPELL-1 double as svs.spl_book[]
// indices while swapping two spells.
const SPELLMENU_DUMP = -3;
const SPELLMENU_CAST = -2;
const SPELLMENU_VIEW = -1;
const SPELLMENU_SORT = MAXSPELL;

// C ref: spell.c's percent_success() armor penalties, which are not
// role-specific.
const uarmhbon = 4; // Metal helmets interfere with the mind
const uarmgbon = 6; // Casting channels through the hands
const uarmfbon = 2; // All metal interferes to some degree

// C ref: spell.h enum spellknowledge (20-25). Values returned by known_spell()
// and used by write.c dowrite() to gate writing by spell knowledge.
export const spe_Forgotten  = -1; // known but no longer castable
export const spe_Unknown    =  0; // not yet known
export const spe_Fresh      =  1; // castable if various casting criteria met
export const spe_GoingStale =  2; // still castable but nearly forgotten

// C ref: spell.c known_spell() (2361-2375). Returns one of the spe_*
// constants indicating the hero's knowledge of a spell identified by its
// object type. The spell must already be in the spellbook list (learned via
// reading) for any result other than spe_Unknown.
export function known_spell(otyp, state = game) {
    for (let i = 0; i < MAXSPELL && spellid(i, state) !== NO_SPELL; i++) {
        if (spellid(i, state) === otyp) {
            const k = spellknow(i, state);
            // KEEN / 10 is the boundary between fresh and going stale.
            // C: (k > KEEN / 10) ? spe_Fresh : (k > 0) ? spe_GoingStale
            //                                           : spe_Forgotten
            return (k > Math.trunc(SPELL_KNOWLEDGE_KEEN / 10))
                ? spe_Fresh
                : (k > 0) ? spe_GoingStale
                    : spe_Forgotten;
        }
    }
    return spe_Unknown;
}

// A pass through the move loop ages every contiguous known spell once,
// independent of the hero's speed or consciousness.
export function age_spells(state = game) {
    const spells = state.svs?.spl_book ?? [];
    for (let index = 0; index < MAXSPELL; ++index) {
        const spell = spells[index];
        if (!spell || spell.sp_id === NO_SPELL) break;
        if (spell.sp_know) spell.sp_know--;
    }
}

// C ref: spell.c spellid(). The spell in slot `spell` of the hero's book, or
// NO_SPELL when the slot is empty.
export function spellid(spell, state = game) {
    return state.svs?.spl_book?.[spell]?.sp_id ?? NO_SPELL;
}

// C ref: spell.h spellknow(). Turns of retention left for slot `spell`.
export function spellknow(spell, state = game) {
    return state.svs?.spl_book?.[spell]?.sp_know ?? 0;
}

// C ref: spell.c losespells(). The spell IDs stay in their original slots;
// only retention is cleared, while an interrupted study context is discarded.
export async function losespells(
    state = game,
    { random = { rn2, rnd, rnl } } = {},
) {
    if (typeof random.rn2 !== 'function'
        || typeof random.rnd !== 'function'
        || typeof random.rnl !== 'function') {
        throw new TypeError('spell forgetting requires rn2, rnd, and rnl');
    }

    state.context ??= {};
    state.context.spbook ??= { delay: 0, book: null, o_id: 0 };
    state.context.spbook.book = null;
    state.context.spbook.o_id = 0;

    let count = 0;
    for (; count < MAXSPELL; ++count) {
        if (spellid(count, state) === NO_SPELL) break;
    }

    let toForget = random.rn2(count + 1);
    if (spellPropertyActive(CONFUSION, state)) {
        const confusedRoll = random.rn2(count + 1);
        if (confusedRoll > toForget) toForget = confusedRoll;
    }
    if (toForget > 1 && random.rnl(7) === 0)
        toForget = random.rnd(toForget);

    for (let index = 0; toForget > 0; ++index) {
        if (random.rn2(count - index) < toForget) {
            const spell = state.svs.spl_book[index];
            spell.sp_know = 0;
            await exercise(A_WIS, false, state, random);
            --toForget;
        }
    }
}

function spellStudyDelay(type) {
    const level = Math.trunc(type.oc_level ?? type.oc_oc2 ?? 0);
    if (level === 1 || level === 2) return -type.oc_delay;
    if (level === 3 || level === 4) return -(level - 1) * type.oc_delay;
    if (level === 5 || level === 6) return -level * type.oc_delay;
    if (level === 7) return -8 * type.oc_delay;
    return 0;
}

function spellPropertyActive(property, state) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

function randomSource(env = {}) {
    const random = env.random ?? { d, rn1, rn2, rnd, rne, rnz };
    if (typeof random.rn1 !== 'function'
        || typeof random.rn2 !== 'function'
        || typeof random.rnd !== 'function') {
        throw new TypeError('spell study requires rn1, rn2, and rnd');
    }
    return random;
}

// C ref: spell.c cursed_book() (130-183). Calls whose C return value is
// discarded but whose source owner is outside this span remain explicit gaps.
export async function cursed_book(book, state = game, env = {}) {
    const random = randomSource(env);
    const message = env.message ?? ttyPline;
    const level = objectType(book, state).oc_level;
    const timeout = state.u?.uprops ?? {};
    let damage;
    switch (random.rn2(level)) {
    case 0:
        await message('You feel a wrenching sensation.', state);
        if (state === game) note_unported('teleport.c tele');
        break;
    case 1:
        await message('You feel threatened.', state);
        aggravate(state, random);
        break;
    case 2: {
        const prior = timeout[BLINDED]?.intrinsic ?? 0;
        await make_blinded(
            (prior & TIMEOUT) + random.rn1(100, 250), true, state,
            { message },
        );
        break;
    }
    case 3:
        if (state === game) note_unported('steal.c take_gold');
        break;
    case 4: {
        await message('These runes were just too much to comprehend.', state);
        const prior = timeout[CONFUSION]?.intrinsic ?? 0;
        await make_confused(
            (prior & TIMEOUT) + random.rn1(7, 16), false, state,
            { message },
        );
        break;
    }
    case 5:
        await message('The book was coated with contact poison!', state);
        if (state.uarmg) {
            await erode_obj(
                state.uarmg, 'gloves', ERODE_CORRODE,
                EF_GREASE | EF_VERBOSE,
                { state, random, message },
            );
            break;
        } else {
            const wasInUse = book.in_use;
            book.in_use = false;
            const resistant = spellPropertyActive(POISON_RES, state);
            const strengthDamage = resistant
                ? random.rn1(2, 1) : random.rn1(4, 3);
            const poisonDamage = random.rnd(resistant ? 6 : 10);
            if (state === game)
                note_unported('attrib.c poison_strdmg');
            void strengthDamage;
            void poisonDamage;
            book.in_use = wasInUse;
            break;
        }
    case 6:
        if (spellPropertyActive(ANTIMAGIC, state)) {
            await shieldeff(state.u.ux, state.u.uy, state);
            await message(
                'The book radiates explosive energy, but you are unharmed!',
                state,
            );
        } else {
            await message(
                `As you read the book, it radiates explosive energy in your ${body_part(FACE, state.youmonst)}!`,
                state,
            );
            damage = 2 * random.rnd(10) + 5;
            void damage;
            if (state === game) note_unported('hack.c losehp');
        }
        return true;
    default:
        {
            const { rndcurse } = await import('./sit.js');
            await rndcurse(state, { ...env, random, message });
        }
        break;
    }
    return false;
}

// C ref: spell.c confused_book() (189-211). The true return marks the book
// consumed by useup(); the caller owns its distinct study-delay updates.
export async function confused_book(book, state = game, env = {}) {
    const random = randomSource(env);
    const message = env.message ?? ttyPline;
    if (!random.rn2(3) && book.otyp !== SPE_BOOK_OF_THE_DEAD) {
        book.in_use = true;
        await message(
            'Being confused you have difficulties in controlling your actions.',
            state,
        );
        if (state === game) note_unported('windows.c display_nhwindow');
        await message('You accidentally tear the spellbook to pieces.', state);
        if (state === game) note_unported('do.c trycall');
        await useup(book, { state, hooks: {} });
        return true;
    }
    const next = state.context?.spbook?.book === book;
    await message(
        `You find yourself reading the ${next ? 'next' : 'first'} line over and over again.`,
        state,
    );
    return false;
}

// C ref: spell.c deadbook_pacify_undead() (211-226). The async monster
// owners preserve the callback's source order when it is run by iter_mons().
async function deadbook_pacify_undead(monster, state, env) {
    if (!(is_undead(monster.data) || is_vampshifter(monster))
        || !cansee(monster.mx, monster.my, state)) {
        return;
    }

    monster.mpeaceful = true;
    if (sgn(monster.data.maligntyp) === sgn(state.u.ualign.type)
        && dist2(monster.mx, monster.my, state.u.ux, state.u.uy) < 4) {
        if (monster.mtame) {
            if (monster.mtame < 20) monster.mtame++;
        } else {
            // C discards tamedog()'s result but its state and messages precede
            // the next monster callback.
            await tamedog(monster, null, true, { ...env, state });
        }
    } else {
        await monflee(monster, 0, false, true, {
            ...env,
            state,
            canSeeMonster: env.canSeeMonster
                ?? ((target) => canseemon(target, state)),
            fleeMessage: env.fleeMessage ?? monfleeMessage,
            message: env.message ?? ttyPline,
        });
    }
}

// C ref: spell.c deadbook() (230-339). The discarded mkinvokearea() call
// remains a named gap; carried revival and the undead swarm use their owners.
async function deadbook(book, state = game, env = {}) {
    const random = randomSource(env);
    const message = env.message ?? ttyPline;
    await message('You turn the pages of the Book of the Dead...', state, env);
    discover_object(
        SPE_BOOK_OF_THE_DEAD,
        true,
        true,
        true,
        state,
        { random },
    );
    observe_object(book, state);
    book.known = true;

    if (invocation_pos(state.u.ux, state.u.uy, state)
        && !On_stairs(state.u.ux, state.u.uy, state)) {
        if (book.cursed) {
            await message(
                spellPropertyActive(BLINDED, state)
                    ? 'The Book seems to be ignoring you!'
                    : "The runes appear scrambled.  You can't read them!",
                state,
                env,
            );
            return;
        }

        if (!state.u.uhave.bell || !state.u.uhave.menorah) {
            await message(
                `A chill runs down your ${body_part(SPINE, state.youmonst)}.`,
                state,
                env,
            );
            if (!state.u.uhave.bell) {
                // The C tty recorder has no Soundeffect backend. Keep the
                // discarded source call explicit while omitting its no-op.
                if (state === game) note_unported('sound.c Soundeffect');
                const heard = youHear('a faint chime...', state);
                if (heard) await message(heard, state, env);
            }
            if (!state.u.uhave.menorah)
                await message("Vlad's doppelganger is amused.", state, env);
            return;
        }

        let candelabrumPrimed = false;
        let bellPrimed = false;
        let relicCursed = false;
        for (let object = state.invent; object; object = object.nobj) {
            if (object.otyp === CANDELABRUM_OF_INVOCATION
                && object.spe === 7 && object.lamplit) {
                if (!object.cursed) candelabrumPrimed = true;
                else relicCursed = true;
            }
            if (object.otyp === BELL_OF_OPENING
                && state.moves - object.age < 5) {
                if (!object.cursed) bellPrimed = true;
                else relicCursed = true;
            }
        }

        if (relicCursed) {
            await message('The invocation fails!', state, env);
            await message('At least one of your relics is cursed...', state, env);
        } else if (candelabrumPrimed && bellPrimed) {
            const soon = random.rnd(6) + random.rnd(6);
            if (state === game) note_unported('mklev.c mkinvokearea');
            state.u.uevent.invoked = true;
            const { record_achievement } = await import('./insight.js');
            record_achievement(ACH_INVK, state);
            state.u.uevent.udemigod = true;
            if (!state.u.udg_cnt || state.u.udg_cnt > soon)
                state.u.udg_cnt = soon;
        } else {
            await message(
                'You have a feeling that something is amiss...',
                state,
                env,
            );
            await raise_dead(state, { ...env, random, message });
        }
        return;
    }

    if (book.cursed) {
        await raise_dead(state, { ...env, random, message });
    } else if (book.blessed) {
        await iter_mons_async(
            (monster) => deadbook_pacify_undead(monster, state, {
                ...env,
                random,
                message,
            }),
            state,
        );
    } else {
        switch (random.rn2(3)) {
        case 0:
            await message('Your ancestors are annoyed with you!', state, env);
            break;
        case 1:
            await message('The headstones in the cemetery begin to move!', state, env);
            break;
        default:
            await message('Oh my! Your name appears in the book!', state, env);
            break;
        }
    }
}

// Helper extracted from spell.c deadbook()'s raise_dead label; C has no
// separate raise_dead function or source unit.
async function raise_dead(state, env) {
    const { random, message } = env;
    await message('You raised the dead!', state, env);
    const creationEnv = await deadbookMakemonEnv(state, random, env);
    if (!random.rn2(3)) {
        let monster = await makemon_runtime(
            state.mons[PM_MASTER_LICH],
            state.u.ux,
            state.u.uy,
            NO_MINVENT,
            creationEnv,
        );
        if (!monster) {
            monster = await makemon_runtime(
                state.mons[PM_NALFESHNEE],
                state.u.ux,
                state.u.uy,
                NO_MINVENT,
                creationEnv,
            );
        }
        if (monster) {
            monster.mpeaceful = false;
            set_malign(monster, state);
        }
    }
    await unturn_dead(state.youmonst, state, env);
    await mkundead({ x: state.u.ux, y: state.u.uy }, true,
        NO_MINVENT, state, creationEnv);
}

async function deadbookMakemonEnv(state, random, env) {
    let stopOccupation = env.hooks?.stopOccupation;
    if (state.go?.occupation && !stopOccupation) {
        const { stop_occupation } = await import('./allmain.js');
        stopOccupation = (_monster, hookEnv) => stop_occupation(
            hookEnv.state,
            hookEnv,
        );
    }
    return {
        ...env,
        state,
        random,
        _deadbook: true,
        // C's makemon appearance uses Norep(), including repeated species
        // within the swarm. Keep custom planning sinks silent while using
        // the ordinary live Norep owner rather than the Book's pline sink.
        norepMessage: env.norepMessage
            ?? (env.message === ttyPline ? ttyNorep : env.message),
        hooks: {
            ...(env.hooks ?? {}),
            ...(stopOccupation ? { stopOccupation } : {}),
        },
    };
}

// C ref: spell.c book_cursed() (343-352). mkobj.c:curse() calls this after a
// spellbook newly becomes cursed; only a book being read interrupts study.
// Return synchronously on the no-effect arms so curse() keeps its synchronous
// result for ordinary object generation.
export function book_cursed(book, state = game, env = {}) {
    if (!book.cursed || (state.multi ?? 0) < 0
        || state.go?.occupation !== learn
        || state.context?.spbook?.book !== book) {
        return;
    }

    const message = env.message ?? ttyPline;
    return (async () => {
        await message(`${Tobjnam(book, 'slam', state)} shut!`, state, env);
        set_bknown(book, 1, { ...env, state });
        const { stop_occupation } = await import('./allmain.js');
        await stop_occupation(state, { ...env, message });
    })();
}

// C ref: spell.c learn() (356-463). `context.spbook` stores both the C book
// pointer and saved object id across occupied turns; book-disappearance is
// owned by the existing inventory lifetime handlers.
export async function learn(state = game, env = {}) {
    const random = randomSource(env);
    const spbook = state.context?.spbook ?? {};
    const book = spbook.book;
    if (!book) {
        if (state === game) note_unported('pline.c impossible');
        return 0;
    }

    if (spbook.delay && state.ublindf?.otyp === LENSES
        && random.rn2(2)) {
        spbook.delay++;
    }
    if (spellPropertyActive(CONFUSION, state)) {
        await confused_book(book, state, { ...env, random });
        spbook.book = null;
        spbook.o_id = 0;
        nomul(spbook.delay, state);
        state.multi_reason = 'reading a book';
        state.nomovemsg = null;
        spbook.delay = 0;
        return 0;
    }
    if (spbook.delay) {
        spbook.delay++;
        return 1;
    }

    await exercise(A_WIS, true, state);
    let booktype = book.otyp;
    if (booktype === SPE_BOOK_OF_THE_DEAD) {
        await deadbook(book, state, { ...env, random });
        return 0;
    }
    const type = objectType(booktype, state);
    const slots = state.svs?.spl_book ?? [];
    let index = 0;
    for (; index < MAXSPELL; ++index) {
        const id = slots[index]?.sp_id ?? NO_SPELL;
        if (id === booktype || id === NO_SPELL) break;
    }

    const costly = true;
    let fadedToBlank = false;
    const spellText = type.oc_name_known
        ? `"${OBJ_NAME(type, state)}"`
        : `the "${OBJ_NAME(type, state)}" spell`;
    if (index === MAXSPELL) {
        if (state === game) note_unported('pline.c impossible');
    } else if ((slots[index]?.sp_id ?? NO_SPELL) === booktype) {
        if ((book.spestudied ?? 0) > MAX_SPELL_STUDY) {
            await ttyPline('This spellbook is too faint to be read any more.', state);
            book.otyp = SPE_BLANK_PAPER;
            booktype = SPE_BLANK_PAPER;
            fadedToBlank = true;
            book.spestudied = random.rn2(book.spestudied);
        } else {
            await ttyPline(
                `Your knowledge of ${spellText} is ${spellknow(index, state) ? 'keener' : 'restored'}.`,
                state,
            );
            slots[index].sp_know = SPELL_KNOWLEDGE_KEEN + 1;
            book.spestudied = (book.spestudied ?? 0) + 1;
            await exercise(A_WIS, true, state);
        }
    } else if ((book.spestudied ?? 0) >= MAX_SPELL_STUDY) {
        await ttyPline('This spellbook is too faint to read even once.', state);
        book.otyp = SPE_BLANK_PAPER;
        booktype = SPE_BLANK_PAPER;
        fadedToBlank = true;
        book.spestudied = random.rn2(book.spestudied);
    } else {
        slots[index].sp_id = booktype;
        slots[index].sp_lev = type.oc_level;
        slots[index].sp_know = SPELL_KNOWLEDGE_KEEN + 1;
        book.spestudied = (book.spestudied ?? 0) + 1;
        if (!index)
            await ttyPline(`You learn ${spellText}.`, state);
        else
            await ttyPline(
                `You add ${spellText} to your repertoire, as '${spellet(index)}'.`,
                state,
            );
    }

    if (index < MAXSPELL) {
        discover_object(booktype, true, true, true, state);
        if (fadedToBlank) update_inventory({ state, hooks: {} });
    }
    if (book.cursed && await cursed_book(book, state, { ...env, random })) {
        await useup(book, { state, hooks: {} });
        spbook.book = null;
        spbook.o_id = 0;
        return 0;
    }
    if (costly) check_unpaid(book, state);
    spbook.book = null;
    spbook.o_id = 0;
    return 0;
}

// C ref: spell.c study_book() (468-659). Study delay, book identity and the
// occupation callback all live in context.spbook, matching C's shared state.
export async function study_book(spellbook, state = game, env = {}) {
    const random = randomSource(env);
    const message = env.message ?? ttyPline;
    const prompt = env.prompt;
    const booktype = spellbook.otyp;
    const confused = spellPropertyActive(CONFUSION, state);
    const type = objectType(booktype, state);
    const level = Math.trunc(type.oc_level ?? type.oc_oc2 ?? 0);
    state.context ??= {};
    state.context.spbook ??= { delay: 0, book: null, o_id: 0 };
    const spbook = state.context.spbook;

    if (!confused && !spellPropertyActive(SLEEP_RES, state)
        && OBJ_DESCR(type, state) === 'dull') {
        let dullbook = random.rnd(25) - acurr(state, A_WIS);
        if (spbook.delay && spellbook === spbook.book)
            dullbook -= random.rnd(level);
        if (dullbook > 0) {
            const species = state.youmonst?.data;
            let eyes = body_part(EYE, state.youmonst);
            const eyeCount = !species || !haseyes(species) ? 0
                : species.pmidx === PM_CYCLOPS
                    || species.pmidx === PM_FLOATING_EYE ? 1 : 2;
            if (eyeCount > 1) eyes = makeplural(eyes);
            await message(
                `This book is so dull that you can't keep your ${eyes} open.`,
                state,
            );
            dullbook += random.rnd(2 * level);
            await fall_asleep(-dullbook, true, state, env);
            return 1;
        }
    }

    if (spbook.delay && !confused && spellbook === spbook.book
        && booktype !== SPE_BLANK_PAPER) {
        await message(
            `You continue your efforts to ${booktype === SPE_NOVEL
                ? 'read the novel' : 'memorize the spell'}.`,
            state,
        );
    } else {
        if (booktype === SPE_BLANK_PAPER) {
            await message('This spellbook is all blank.', state);
            discover_object(booktype, true, true, true, state);
            return 1;
        }
        if (booktype === SPE_NOVEL) {
            const title = noveltitle(spellbook.novelidx, { random });
            spellbook.novelidx = title.novelidx;
            if (await read_tribute(
                'books', title.title, 0, null, 0, spellbook.o_id, state,
                { ...env, random },
            )) {
                state.u.uconduct ??= {};
                if (!state.u.uconduct.literate++)
                    livelog_printf(
                        LL_CONDUCT,
                        `became literate by reading ${title.title}`,
                        state,
                    );
                check_unpaid(spellbook, state);
                discover_object(booktype, true, true, true, state);
                if (!state.u.uevent.read_tribute) {
                    (await import('./insight.js')).record_achievement(
                        ACH_NOVL, state,
                    );
                    more_experienced(20, 0, state);
                    await newexplevel(state);
                    state.u.uevent.read_tribute = 1;
                }
            }
            return 1;
        }

        spbook.delay = spellStudyDelay(type);
        let index = 0;
        for (; index < MAXSPELL; ++index) {
            if (spellid(index, state) === booktype
                || spellid(index, state) === NO_SPELL) break;
        }
        if (spellid(index, state) === booktype
            && spellknow(index, state)
                > Math.trunc(SPELL_KNOWLEDGE_KEEN / 10)) {
            await message(
                `You know "${OBJ_NAME(type, state)}" quite well already.`,
                state,
            );
            discover_object(booktype, true, true, true, state);
            if (typeof prompt !== 'function')
                throw new TypeError('study_book requires a prompt owner');
            const answer = await prompt('Refresh your memory anyway?', state);
            if (answer === 'n' || answer === 'n'.charCodeAt(0)) return 0;
        }

        spellbook.in_use = true;
        if (!spellbook.blessed && booktype !== SPE_BOOK_OF_THE_DEAD) {
            let tooHard = spellbook.cursed;
            if (!spellbook.cursed) {
                const readAbility = acurr(state, A_INT) + 4
                    + Math.trunc(state.u.ulevel / 2) - 2 * level
                    + (state.ublindf?.otyp === LENSES ? 2 : 0);
                if (state.urole?.mnum === PM_WIZARD
                    && readAbility < 20 && !confused) {
                    if (typeof prompt !== 'function')
                        throw new TypeError('study_book requires a prompt owner');
                    const wording = readAbility < 12 ? 'very ' : '';
                    const answer = await prompt(
                        `This spellbook is ${wording}difficult to comprehend.  Continue?`,
                        state,
                    );
                    if (answer !== 'y' && answer !== 'y'.charCodeAt(0)) {
                        spellbook.in_use = false;
                        return 1;
                    }
                }
                if (random.rnd(20) > readAbility) tooHard = true;
            }
            if (tooHard) {
                const gone = await cursed_book(spellbook, state, {
                    ...env, random, message,
                });
                nomul(spbook.delay, state);
                state.multi_reason = 'reading a book';
                state.nomovemsg = null;
                spbook.delay = 0;
                if (gone || !random.rn2(3)) {
                    if (!gone)
                        await message('The spellbook crumbles to dust!', state);
                    if (state === game) note_unported('do.c trycall');
                    await useup(spellbook, { state, hooks: {} });
                } else {
                    spellbook.in_use = false;
                }
                return 1;
            }
        }
        if (confused) {
            const gone = await confused_book(spellbook, state, {
                ...env, random, message,
            });
            if (!gone) spellbook.in_use = false;
            nomul(spbook.delay, state);
            state.multi_reason = 'reading a book';
            state.nomovemsg = null;
            spbook.delay = 0;
            return 1;
        }
        spellbook.in_use = false;
        await message(
            `You begin to ${booktype === SPE_BOOK_OF_THE_DEAD
                ? 'recite' : 'memorize'} the runes.`,
            state,
        );
    }

    spbook.book = spellbook;
    spbook.o_id = spellbook.o_id ?? 0;
    set_occupation(learn, 'studying', 0, state);
    return 1;
}

// C ref: spell.c spellev(). The spell's level, copied from the book's
// oc_level when the spell was learned.
export function spellev(spell, state = game) {
    return state.svs?.spl_book?.[spell]?.sp_lev ?? 0;
}

// C ref: spell.c spellname().
export function spellname(spell, state = game) {
    return OBJ_NAME(objectType(spellid(spell, state), state), state);
}

// C ref: spell.c spellet(). Casting letters run 'a'..'z' then 'A'..'Z'.
export function spellet(spell) {
    return spell < 26
        ? String.fromCharCode('a'.charCodeAt(0) + spell)
        : String.fromCharCode('A'.charCodeAt(0) + spell - 26);
}

// C ref: spell.c spelltypemnemonic().
export function spelltypemnemonic(skill) {
    switch (skill) {
    case P_ATTACK_SPELL:
        return 'attack';
    case P_HEALING_SPELL:
        return 'healing';
    case P_DIVINATION_SPELL:
        return 'divination';
    case P_ENCHANTMENT_SPELL:
        return 'enchantment';
    case P_CLERIC_SPELL:
        return 'clerical';
    case P_ESCAPE_SPELL:
        return 'escape';
    case P_MATTER_SPELL:
        return 'matter';
    default:
        note_unported('pline.c impossible');
        return '';
    }
}

// C ref: spell.c percent_success(). Pure: it reads the hero, the worn
// equipment, and the object catalog, and changes nothing.
export function percent_success(spell, state = game) {
    const urole = state.urole;
    const skilltype = spell_skilltype(spellid(spell, state), state);
    // Knights don't get metal armor penalty for clerical spells
    const paladin_bonus = urole.mnum === PM_KNIGHT
        && skilltype === P_CLERIC_SPELL;

    /* Calculate intrinsic ability (splcaster) */
    let splcaster = urole.spelbase;
    const special = urole.spelheal;
    const statused = acurr(state, urole.spelstat);

    if (state.uarm && isMetallic(state.uarm, state) && !paladin_bonus) {
        splcaster += (state.uarmc && state.uarmc.otyp === ROBE)
            ? Math.trunc(urole.spelarmr / 2)
            : urole.spelarmr;
    } else if (state.uarmc && state.uarmc.otyp === ROBE) {
        splcaster -= urole.spelarmr;
    }
    if (state.uarms) splcaster += urole.spelshld;

    if (state.uwep && state.uwep.otyp === QUARTERSTAFF)
        splcaster -= 3; /* Small bonus */

    if (!paladin_bonus) {
        if (state.uarmh && isMetallic(state.uarmh, state))
            splcaster += uarmhbon;
        if (state.uarmg && isMetallic(state.uarmg, state))
            splcaster += uarmgbon;
        if (state.uarmf && isMetallic(state.uarmf, state))
            splcaster += uarmfbon;
    }

    const otyp = spellid(spell, state);
    if (otyp === urole.spelspec) splcaster += urole.spelsbon;

    /* `healing spell' bonus */
    if (otyp === SPE_HEALING || otyp === SPE_EXTRA_HEALING
        || otyp === SPE_CURE_BLINDNESS
        || otyp === SPE_CURE_SICKNESS
        || otyp === SPE_RESTORE_ABILITY
        || otyp === SPE_REMOVE_CURSE)
        splcaster += special;

    if (splcaster > 20) splcaster = 20;

    /* Calculate learned ability */
    let chance = Math.trunc(11 * statused / 2);

    let skill = P_SKILL(skilltype, state);
    skill = Math.max(skill, P_UNSKILLED) - 1; /* unskilled => 0 */
    const difficulty = (spellev(spell, state) - 1) * 4
        - (skill * 6 + Math.trunc(state.u.ulevel / 3) + 1);

    if (difficulty > 0) {
        /* Player is too low level or unskilled. */
        chance -= isqrt(900 * difficulty + 2000);
    } else {
        const learning = Math.trunc(
            15 * -difficulty / spellev(spell, state),
        );
        chance += learning > 20 ? 20 : learning;
    }

    if (chance < 0) chance = 0;
    if (chance > 120) chance = 120;

    /* Wearing anything but a light shield makes it very awkward to cast. */
    if (state.uarms
        && weight(state.uarms, { state })
            > objectType(SMALL_SHIELD, state).oc_weight) {
        chance = otyp === urole.spelspec
            ? Math.trunc(chance / 2)
            : Math.trunc(chance / 4);
    }

    chance = Math.trunc(chance * (20 - splcaster) / 15) - splcaster;

    /* Clamp to percentile */
    if (chance > 100) chance = 100;
    if (chance < 0) chance = 0;

    return chance;
}

// C ref: spell.c spellretention(). C fills a caller-supplied buffer and
// returns it; the port returns the string.
export function spellretention(idx, state = game) {
    let skill = P_SKILL(spell_skilltype(spellid(idx, state), state), state);
    skill = Math.max(skill, P_UNSKILLED); /* restricted same as unskilled */
    const turnsleft = spellknow(idx, state);

    if (turnsleft < 1) {
        /* spell has expired; hero can't successfully cast it anymore */
        return '(gone)';
    }
    if (turnsleft >= SPELL_KNOWLEDGE_KEEN) {
        /* full retention, first turn or immediately after reading book */
        return '100%';
    }
    // Retention is a range of percentages whose width depends on skill:
    // expert 2%, skilled 5%, basic 10%, unskilled 25%.
    let percent = Math.trunc(
        (turnsleft - 1) / Math.trunc(SPELL_KNOWLEDGE_KEEN / 100),
    ) + 1;
    const accuracy = (skill === P_EXPERT) ? 2
        : (skill === P_SKILLED) ? 5
            : (skill === P_BASIC) ? 10
                : 25;
    /* round up to the high end of this range */
    percent = accuracy * (Math.trunc((percent - 1) / accuracy) + 1);
    return `${percent - accuracy + 1}%-${percent}%`;
}

// C ref: spell.c spl_sort_types and spl_sortchoices (1840-1866).
export const SORTBY_LETTER = 0;
export const SORTBY_ALPHA = 1;
export const SORTBY_LVL_LO = 2;
export const SORTBY_LVL_HI = 3;
export const SORTBY_SKL_AL = 4;
export const SORTBY_SKL_LO = 5;
export const SORTBY_SKL_HI = 6;
export const SORTBY_CURRENT = 7;
export const SORTRETAINORDER = 8;
const spl_sortchoices = [
    'by casting letter',
    'alphabetically',
    'by level, low to high',
    'by level, high to low',
    'by skill group, alphabetized within each group',
    'by skill group, low to high level within group',
    'by skill group, high to low level within group',
    'maintain current ordering',
    'reassign casting letters to retain current order',
];

// decl.c gs.spl_sortmode/gs.spl_orderindx start at 0/NULL. They describe
// temporary display order, independently of the persistent svs.spl_book.
function spellSortState(state) {
    state.gs ??= {};
    state.gs.spl_sortmode ??= SORTBY_LETTER;
    state.gs.spl_orderindx ??= null;
    return state.gs;
}

// C ref: spell.c spell_cmp(). position1/2 represent the callback's pointers
// into the original index array, as patch002's stable qsort wrapper passes
// them. SORTBY_CURRENT ordinarily returns before calling the comparator.
export function spell_cmp(indx1, indx2, state = game,
    position1 = indx1, position2 = indx2) {
    const otyp1 = spellid(indx1, state), otyp2 = spellid(indx2, state);
    const obj1 = objectType(otyp1, state), obj2 = objectType(otyp2, state);
    const levl1 = obj1.oc_level, levl2 = obj2.oc_level;
    const skil1 = obj1.oc_skill, skil2 = obj2.oc_skill;
    switch (state.gs?.spl_sortmode ?? SORTBY_LETTER) {
    case SORTBY_LETTER: return indx1 - indx2;
    case SORTBY_ALPHA: break;
    case SORTBY_LVL_LO:
        if (levl1 !== levl2) return levl1 - levl2;
        break;
    case SORTBY_LVL_HI:
        if (levl1 !== levl2) return levl2 - levl1;
        break;
    case SORTBY_SKL_AL:
        if (skil1 !== skil2) return skil1 - skil2;
        break;
    case SORTBY_SKL_LO:
        if (skil1 !== skil2) return skil1 - skil2;
        if (levl1 !== levl2) return levl1 - levl2;
        break;
    case SORTBY_SKL_HI:
        if (skil1 !== skil2) return skil1 - skil2;
        if (levl1 !== levl2) return levl2 - levl1;
        break;
    default:
        return position1 < position2 ? -1 : Number(position1 > position2);
    }
    // include/global.h strcmpi is strncmpi(a,b,-1), with ASCII lowc().
    return strncmpi(OBJ_NAME(obj1, state), OBJ_NAME(obj2, state), -1);
}

// C ref: spell.c sortspells(). Only RETAIN changes casting letters.
export function sortspells(state = game) {
    const gs = spellSortState(state);
    if (gs.spl_sortmode === SORTBY_CURRENT) return;
    let n = 0;
    while (n < MAXSPELL && spellid(n, state) !== NO_SPELL) ++n;
    if (n < 2) return;
    if (!gs.spl_orderindx) {
        if (gs.spl_sortmode === SORTBY_LETTER
            || gs.spl_sortmode === SORTRETAINORDER) return;
        gs.spl_orderindx = Array.from({ length: MAXSPELL }, (_, i) => i);
    }
    if (gs.spl_sortmode === SORTRETAINORDER) {
        // C copies structs by value, including all unused slots.
        const tmp_book = gs.spl_orderindx.map(
            (index) => ({ ...state.svs.spl_book[index] }),
        );
        for (let i = 0; i < MAXSPELL; ++i) {
            state.svs.spl_book[i] = tmp_book[i];
            gs.spl_orderindx[i] = i;
        }
        gs.spl_sortmode = SORTBY_LETTER;
        return;
    }
    // ES sort is stable, matching patch002's original-position tie-break.
    const order = gs.spl_orderindx.slice(0, n)
        .sort((a, b) => spell_cmp(a, b, state));
    for (let i = 0; i < n; ++i) gs.spl_orderindx[i] = order[i];
}

// Bounded window seam for spell.c's menu calls. Import at the async call
// boundary so this does not add a startup cycle through cmd/display.
async function spellMenu(items, how, prompt, state, selection = {}) {
    const { select_menu } = await import('./windows.js');
    const { menuTitleStyle } = await import('./tty_menu.js');
    const style = menuTitleStyle(state);
    return select_menu(state, {
        items: items.map((item) => item.heading
            ? { ...item, attr: style.titleAttr, color: style.titleColor }
            : item),
        how, title: prompt, ...style, ...selection,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
}

// Production menus return C's ordered selected[] rows, including their counts.
// A scalar remains usable by an injected caller, but cannot imply deselection.
function spellMenuValues(chosen) {
    if (Array.isArray(chosen)) return chosen.map(item => item.value);
    if (chosen == null) return [];
    return [typeof chosen === 'object' ? chosen.value : chosen];
}

// C ref: spell.c spellsortmenu().
export async function spellsortmenu(state = game, menu = spellMenu) {
    const gs = spellSortState(state);
    const items = [];
    for (let i = 0; i < spl_sortchoices.length; ++i) {
        if (i === SORTRETAINORDER) items.push({ text: '' });
        items.push({
            selector: i === SORTRETAINORDER ? 'z' : String.fromCharCode(97 + i),
            value: i + 1,
            label: spl_sortchoices[i],
            selected: i === gs.spl_sortmode,
        });
    }
    const selected = spellMenuValues(await menu(
        items, PICK_ONE, 'View known spells list sorted', state,
        { returnSelections: true },
    ));
    if (!selected.length) return false;
    let choice = selected[0] - 1;
    if (selected.length > 1 && choice === gs.spl_sortmode)
        choice = selected[1] - 1;
    gs.spl_sortmode = choice;
    return true;
}

// C ref: spell.c dovspell(). Returns ECMD_OK without taking game time.
export async function dovspell(state = game,
    { message = ttyPline, menu = spellMenu } = {}) {
    const gs = spellSortState(state);
    if (spellid(0, state) === NO_SPELL) {
        await message("You don't know any spells right now.", state);
    } else {
        for (;;) {
            const result = await dospellmenu(
                'Currently known spells', SPELLMENU_VIEW, state, menu,
            );
            if (!result.ok) break;
            const splnum = result.spell_no;
            if (splnum === SPELLMENU_SORT) {
                if (await spellsortmenu(state, menu)) sortspells(state);
            } else {
                const other = await dospellmenu(
                    `Reordering spells; swap '${spellet(splnum)}' with`,
                    splnum, state, menu,
                );
                if (!other.ok) break;
                const spl_tmp = state.svs.spl_book[splnum];
                state.svs.spl_book[splnum] = state.svs.spl_book[other.spell_no];
                state.svs.spl_book[other.spell_no] = spl_tmp;
            }
        }
    }
    gs.spl_orderindx = null;
    gs.spl_sortmode = SORTBY_LETTER;
    return ECMD_OK;
}

// C ref: spell.c show_spells(). end.c's caller is DUMPLOG-inactive in the
// reference build; preserve the function and its source menu call anyway.
export async function show_spells(state = game,
    { message = ttyPline, menu = spellMenu } = {}) {
    if (spellid(0, state) === NO_SPELL) {
        await message("You didn't know any spells.", state);
        await message('', state);
    } else {
        await message('Spells:', state);
        await dospellmenu('', SPELLMENU_DUMP, state, menu);
    }
}

// C ref: spell.c dospellmenu(). The boolean and out-index are {ok,spell_no}.
export async function dospellmenu(prompt, splaction, state = game,
    menu = spellMenu) {
    const sep = state.iflags?.menu_tab_sep ? '\t' : ' ';
    let heading = sep === '\t' ? 'Name\tLevel\tCategory\tFail\tRetention'
        : `${splaction === SPELLMENU_DUMP ? '' : '    '}${'Name'.padEnd(20)}`
            + ` Level ${'Category'.padEnd(12)} Fail Retention`;
    if (state.wizard) heading += `${sep}${'turns'.padStart(6)}`;
    const items = [{ text: heading, heading: true }];
    for (let i = 0; i < MAXSPELL && spellid(i, state) !== NO_SPELL; ++i) {
        const splnum = state.gs?.spl_orderindx ? state.gs.spl_orderindx[i] : i;
        const name = spellname(splnum, state);
        const level = spellev(splnum, state);
        const category = spelltypemnemonic(
            spell_skilltype(spellid(splnum, state), state),
        );
        const fail = 100 - percent_success(splnum, state);
        const retention = spellretention(splnum, state);
        let text = sep === '\t'
            ? `${name}\t${level}\t${category}\t${fail}%\t${retention}`
            : `${name.padEnd(20)}  ${String(level).padStart(2)}   `
                + `${category.padEnd(12)} ${String(fail).padStart(3)}% `
                + retention.padStart(9);
        // Preserve C's loop index, even when splnum has been sorted.
        if (state.wizard) text += `${sep}${String(spellknow(i, state)).padStart(6)}`;
        items.push({ selector: spellet(splnum), label: text,
            value: splnum + 1, selected: splnum === splaction });
    }
    let how = PICK_ONE;
    if (splaction === SPELLMENU_VIEW) {
        if (spellid(1, state) === NO_SPELL) how = PICK_NONE;
        else items.push({ selector: '+', label: '[sort spells]',
            value: SPELLMENU_SORT + 1 });
    }
    const selection = { returnSelections: true };
    const selected = spellMenuValues(await menu(
        items, how, prompt, state, selection,
    ));
    if (selected.length) {
        let spell_no = selected[0] - 1;
        if (selected.length > 1 && spell_no === splaction)
            spell_no = selected[1] - 1;
        return { ok: spell_no !== splaction, spell_no };
    }
    if (splaction >= 0) return { ok: true, spell_no: splaction };
    return { ok: false, spell_no: splaction };
}

// C ref: spell.c spell_let_to_idx() (115-126). Converts a letter ('a'..'z' or
// 'A'..'Z') to a spl_book[] index (0..51), or -1 for anything else.
function spell_let_to_idx(ilet) {
    let indx = ilet.charCodeAt(0) - 'a'.charCodeAt(0);
    if (indx >= 0 && indx < 26) return indx;
    indx = ilet.charCodeAt(0) - 'A'.charCodeAt(0);
    if (indx >= 0 && indx < 26) return indx + 26;
    return -1;
}

// C ref: spell.c spell_idx() (2379-2387). Scans spl_book[] for the spell whose
// object type matches otyp and returns its index, or UNKNOWN_SPELL (-1).
const UNKNOWN_SPELL = -1;
function spell_idx(otyp, state = game) {
    for (let i = 0; i < MAXSPELL && spellid(i, state) !== NO_SPELL; ++i)
        if (spellid(i, state) === otyp)
            return i;
    return UNKNOWN_SPELL;
}

// C ref: spell.c rejectcasting() (687-708). Checks that the hero can cast at
// all: not stunned, can chant, has a free hand (or wields a quarterstaff).
async function rejectcasting(state, { message }) {
    if (Boolean(state.u?.uprops?.[STUNNED]?.intrinsic)) {
        await message('You are too impaired to cast a spell.', state);
        return true;
    } else if (!can_chant(state.youmonst, state)) {
        await message('You are unable to chant the incantation.', state);
        return true;
    } else if (!freehand(state)
        && !(state.uwep && state.uwep.otyp === QUARTERSTAFF)) {
        await message('Your arms are not free to cast!', state);
        return true;
    }
    return false;
}

// C ref: spell.c getspell() (715-783). Selects a spell from the hero's known
// spells. Returns { ok, spell_no }; ok is true when a spell was chosen.
// The MENU_TRADITIONAL yn_function branch is not ported (the default menu
// style is MENU_FULL, which goes through dospellmenu()).
async function getspell(state, { message, menu }) {
    const nspells = num_spells(state);
    if (!nspells) {
        await message("You don't know any spells right now.", state);
        return { ok: false, spell_no: -1 };
    }
    if (await rejectcasting(state, { message }))
        return { ok: false, spell_no: -1 };

    // C checks cmdq_pop() for a queued key; this happens during repeats.
    const cq = cmdq_pop(state);
    if (cq != null) {
        if (cq.typ === CMDQ_KEY) {
            const idx = spell_let_to_idx(cq.key);
            if (idx < 0 || idx >= nspells)
                return { ok: false, spell_no: -1 };
            return { ok: true, spell_no: idx };
        }
        return { ok: false, spell_no: -1 };
    }

    // Non-traditional menu: the menu style is MENU_FULL by default.
    return dospellmenu('Choose which spell to cast', SPELLMENU_CAST,
        state, menu);
}

// C ref: spell.c cast_protection() (1104–1178). Integer divisions truncate
// toward zero; the source feedback finishes before protection and AC change.
export async function cast_protection(state = game, env = {}) {
    const u = state.u;
    let l = u.ulevel, loglev = 0;
    let natac = u.uac + u.uspellprot;
    while (l) {
        ++loglev;
        l = Math.trunc(l / 2);
    }
    natac = Math.trunc((10 - natac) / 10);
    const gain = loglev - Math.trunc(u.uspellprot / (4 - Math.min(3, natac)));
    const message = env.message ?? ttyPline;
    if (gain > 0) {
        if (!heroIsBlind(state)) {
            // decl.c c_color_names.c_golden is "golden". Naming uses display
            // RNG, independently of spelleffects' optional core RNG adapter.
            const displayEnv = { state, displayRandom: env.displayRandom };
            const hgolden = hcolor('golden', state, displayEnv);
            if (u.uspellprot) {
                await message(`The ${hgolden} haze around you becomes more dense.`, state);
            } else {
                const pm = u.ustuck?.data;
                const rmtyp = state.level.at(u.ux, u.uy).typ;
                const atmosphere = pm && u.uswallow
                    ? pm === state.mons[PM_FOG_CLOUD] ? 'mist'
                        : is_whirly(pm) ? 'maelstrom'
                            : dmgtype_fromattack(pm, AD_WRAP, AT_ENGL) ? 'folds'
                                : is_animal(pm) ? 'maw' : 'ooze'
                    : u.uinwater ? hliquid('water', displayEnv)
                        : rmtyp === CLOUD ? 'cloud'
                            : IS_TREE(rmtyp, state) ? 'vegetation'
                                : IS_STWALL(rmtyp) ? 'stone' : 'air';
                await message(`The ${atmosphere} around you begins to shimmer with ${an(hgolden)} haze.`, state);
            }
        }
        u.uspellprot = (u.uspellprot + gain) & 0xff; // you.h uchar field.
        u.uspmtime = P_SKILL(spell_skilltype(SPE_PROTECTION, state), state) === P_EXPERT
            ? 20 : 10;
        if (!u.usptime) u.usptime = u.uspmtime;
        find_ac(state);
    } else {
        await message('Your skin feels warm for a moment.', state);
    }
}

// C ref: spell.c spell_backfire() (1181-1217). Add confusion/stun timeouts
// in source order; FALSE suppresses the setters' optional messages.
export async function spell_backfire(spell, state = game, env = {}) {
    const random = randomSource(env);
    const duration = (spellev(spell, state) + 1) * 3;
    const oldStun = (state.u.uprops[STUNNED]?.intrinsic ?? 0) & TIMEOUT;
    const oldConf = (state.u.uprops[CONFUSION]?.intrinsic ?? 0) & TIMEOUT;
    state.disp ??= {};
    switch (random.rn2(10)) {
    case 0: case 1: case 2: case 3:
        await make_confused(oldConf + duration, false, state, env);
        break;
    case 4: case 5: case 6:
        await make_confused(oldConf + Math.trunc(2 * duration / 3), false, state, env);
        await make_stunned(oldStun + Math.trunc(duration / 3), false, state, env);
        break;
    case 7: case 8:
        await make_stunned(oldStun + Math.trunc(2 * duration / 3), false, state, env);
        await make_confused(oldConf + Math.trunc(duration / 3), false, state, env);
        break;
    case 9:
        await make_stunned(oldStun + duration, false, state, env);
        break;
    }
}

// C ref: spell.c spelleffects_check() (1220-1380). The result object carries
// C's boolean return and caller-owned res/energy out parameters. Amulet drain
// sets res to ECMD_TIME before an insufficient-energy abort; hunger still
// uses the base spell cost. Direct dotele casts supply no operation env.
export async function spelleffects_check(spell, state = game, env = {}) {
    env = { ...env, message: env.message ?? ttyPline };
    const random = randomSource(env);
    let res = ECMD_OK;
    const confused = Boolean(
        state.u?.uprops?.[CONFUSION]?.intrinsic,
    );
    let energy = 0;

    // Reject casting while stunned or with no free hands.
    if (spell === UNKNOWN_SPELL
        || await rejectcasting(state, env)) {
        return { abort: true, res: ECMD_OK, energy };
    }

    // SPELL_LEV_PW(lvl) = lvl * 5
    energy = spellev(spell, state) * 5; /* 5 <= energy <= 35 */

    if (spellknow(spell, state) <= 0) {
        await env.message('Your knowledge of this spell is twisted.', state);
        await env.message('It invokes nightmarish images in your mind...', state);
        await spell_backfire(spell, state, env);
        state.u.uen = Math.max(0, state.u.uen - random.rnd(energy));
        state.disp ??= {};
        state.disp.botl = true;
        return { abort: true, res: ECMD_TIME, energy };
    } else if (spellknow(spell, state) <= Math.trunc(SPELL_KNOWLEDGE_KEEN / 200)) {
        await env.message('You strain to recall the spell.', state);
    } else if (spellknow(spell, state) <= Math.trunc(SPELL_KNOWLEDGE_KEEN / 40)) {
        await env.message('You have difficulty remembering the spell.', state);
    } else if (spellknow(spell, state) <= Math.trunc(SPELL_KNOWLEDGE_KEEN / 20)) {
        await env.message('Your knowledge of this spell is growing faint.', state);
    } else if (spellknow(spell, state) <= Math.trunc(SPELL_KNOWLEDGE_KEEN / 10)) {
        await env.message('Your recall of this spell is gradually fading.', state);
    }

    if (state.u.uhunger <= 10
        && spellid(spell, state) !== SPE_DETECT_FOOD) {
        await env.message('You are too hungry to cast that spell.', state);
        return { abort: true, res: ECMD_OK, energy };
    } else if (acurr(state, A_STR) < 4
        && spellid(spell, state) !== SPE_RESTORE_ABILITY) {
        await env.message('You lack the strength to cast spells.', state);
        return { abort: true, res: ECMD_OK, energy };
    } else if (await check_capacity(
        'Your concentration falters while carrying so much stuff.', state)) {
        return { abort: true, res: ECMD_TIME, energy };
    }

    // Amulet of Yendor energy drain
    if (state.u.uhave?.amulet && state.u.uen >= energy) {
        await env.message('You feel the amulet draining your energy away.', state);
        state.u.uen = Math.max(0, state.u.uen - random.rnd(2 * energy));
        state.disp ??= {};
        state.disp.botl = true;
        res = ECMD_TIME;
    }

    if (energy > state.u.uen) {
        const suffix = (state.u.uen < state.u.uenmax) ? ''
            : (energy > state.u.uenpeak) ? ' yet'
                : ' anymore';
        await env.message(
            `You don't have enough energy to cast that spell${suffix}.`,
            state,
        );
        return { abort: true, res, energy };
    }

    // Deduct hunger for casting (detect food is exempt).
    if (spellid(spell, state) !== SPE_DETECT_FOOD) {
        let hungr = energy * 2;
        let intell = acurr(state, A_INT);
        if (state.urole.mnum !== PM_WIZARD)
            intell = 10;
        switch (intell) {
        case 25: case 24: case 23: case 22: case 21:
        case 20: case 19: case 18: case 17:
            hungr = 0;
            break;
        case 16:
            hungr = Math.trunc(hungr / 4);
            break;
        case 15:
            hungr = Math.trunc(hungr / 2);
            break;
        }
        if (hungr > state.u.uhunger - 3)
            hungr = state.u.uhunger - 3;
        await morehungry(hungr, state, env);
    }

    const chance = percent_success(spell, state);
    if (confused || (random.rnd(100) > chance)) {
        await env.message(
            'You fail to cast the spell correctly.',
            state,
        );
        state.u.uen -= Math.trunc(energy / 2);
        state.disp = state.disp || {};
        state.disp.botl = true;
        return { abort: true, res: ECMD_TIME, energy };
    }
    return { abort: false, res, energy };
}

// hack.h:1236 Maybe_Half_Phys(). youprop.h:341 defines Half_physical_damage
// as the intrinsic or the extrinsic, with no blocking term.
function Maybe_Half_Phys(dmg, state) {
    const halved = state.u?.uprops?.[HALF_PHDAM];
    return (halved?.intrinsic || halved?.extrinsic)
        ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: spell.c spelleffects() (1385-1603). Casts the spell identified by
// spell_otyp (an object type such as SPE_HEALING). The wand-duplicate and
// potion-duplicate dispatch arms are open; scroll-duplicate spells (seffects)
// and standalone spells (cure blindness, etc.) remain fail-closed except for
// the source-wired scroll-duplicate effects.
export async function spelleffects(spell_otyp, atme, force, state = game,
    env = {}) {
    const random = randomSource(env);
    const spell = force ? spell_otyp : spell_idx(spell_otyp, state);
    let energy = 0;
    let res = ECMD_OK;
    let physical_damage = false;

    if (!force) {
        const check = await spelleffects_check(spell, state, env);
        if (check.abort) return check.res;
        energy = check.energy;
    }

    state.u.uen -= energy;
    state.disp = state.disp || {};
    state.disp.botl = true;
    await exercise(A_WIS, true, state, random);

    // pseudo is a temporary "false" object containing the spell stats.
    const pseudo = mksobj(
        force ? spell : spellid(spell, state), false, false, { state },
    );
    pseudo.blessed = 0;
    pseudo.cursed = 0;
    pseudo.quan = 20; /* do not let useup get it */

    const otyp = pseudo.otyp;
    const skill = spell_skilltype(otyp, state);
    const role_skill = P_SKILL(skill, state);

    switch (otyp) {
    case SPE_CURE_SICKNESS: {
        const wasSick = Boolean(state.u.uprops[SICK].intrinsic);
        const wasSlimed = Boolean(state.u.uprops[SLIMED].intrinsic);
        await healup(0, 0, true, false, state, env);
        const message = env.message ?? ttyPline;
        if (wasSick || !wasSlimed) {
            await message(
                `You are ${wasSick ? 'no longer' : 'not'} ill.`, state,
            );
        }
        if (wasSlimed)
            await make_slimed(0, 'The slime disappears!', state, env);
        break;
    }
    // C spell.c:1420–1452, skilled storm branch. Other casting arms retain
    // their existing source coverage; the target family is owned below.
    case SPE_FIREBALL:
    case SPE_CONE_OF_COLD:
        if (role_skill >= P_SKILLED) {
            if (await throwspell(state)) {
                const cc = {x:state.u.dx, y:state.u.dy};
                let n = random.rnd(8) + 1;
                while (n--) {
                    if (!state.u.dx && !state.u.dy && !state.u.dz) {
                        const damage = await zapyourself(pseudo, true, state);
                        if (damage)
                            await losehp(damage, `zapped ${uhim(state)}self with a spell`,
                                NO_KILLER_PREFIX, state);
                    } else {
                        await explode(state.u.dx, state.u.dy,
                            otyp - SPE_MAGIC_MISSILE + 10,
                            spell_damage_bonus(Math.trunc(state.u.ulevel / 2) + 1, state),
                            0, otyp === SPE_CONE_OF_COLD ? EXPL_FROSTY : EXPL_FIERY,
                            state);
                    }
                    // C final death does not return; life saving/debug does.
                    if (state.program_state?.gameover) return ECMD_TIME;
                    state.u.dx = cc.x + random.rnd(3) - 2;
                    state.u.dy = cc.y + random.rnd(3) - 2;
                    if (!isok(state.u.dx, state.u.dy)
                        || !cansee(state.u.dx, state.u.dy, state)
                        || IS_STWALL(state.level.at(state.u.dx, state.u.dy).typ)
                        || state.u.uswallow) {
                        state.u.dx = cc.x;
                        state.u.dy = cc.y;
                    }
                }
            }
            break;
        }
        // falls through
    case SPE_FORCE_BOLT:
        physical_damage = true;
        // falls through
    case SPE_SLEEP:
    case SPE_MAGIC_MISSILE:
    case SPE_KNOCK:
    case SPE_SLOW_MONSTER:
    case SPE_WIZARD_LOCK:
    case SPE_DIG:
    case SPE_TURN_UNDEAD:
    case SPE_POLYMORPH:
    case SPE_TELEPORT_AWAY:
    case SPE_CANCELLATION:
    case SPE_FINGER_OF_DEATH:
    case SPE_LIGHT:
    case SPE_DETECT_UNSEEN:
    case SPE_HEALING:
    case SPE_EXTRA_HEALING:
    case SPE_DRAIN_LIFE:
    case SPE_STONE_TO_FLESH:
        if (objectType(otyp, state).oc_dir !== NODIR) {
            if (otyp === SPE_HEALING || otyp === SPE_EXTRA_HEALING) {
                // Healing and extra healing are actually potion effects,
                // but they've been extended to take a direction like wands.
                if (role_skill >= P_SKILLED)
                    pseudo.blessed = 1;
            }
            if (atme) {
                state.u.dx = state.u.dy = state.u.dz = 0;
            } else if (!await getdir(null, state)) {
                // getdir cancelled: re-use previous direction.
                await env.message('The magical energy is released!', state);
            }
            if (!state.u.dx && !state.u.dy && !state.u.dz) {
                let damage = await zapyourself(pseudo, true, state);
                if (damage !== 0) {
                    const buf =
                        `zapped ${uhim(state)}self with a spell`;
                    if (physical_damage)
                        damage = Maybe_Half_Phys(damage, state);
                    await losehp(damage, buf, NO_KILLER_PREFIX, state);
                }
            } else {
                await weffects(pseudo, state);
            }
        } else {
            await weffects(pseudo, state);
        }
        update_inventory({ state });
        break;

    // spell.c routes this group through read.c:seffects() after granting the
    // blessed-scroll equivalent at Skilled or Expert skill.
    case SPE_REMOVE_CURSE:
    case SPE_CAUSE_FEAR:
    case SPE_CHARM_MONSTER:
    case SPE_CONFUSE_MONSTER:
    case SPE_DETECT_FOOD:
    case SPE_IDENTIFY:
        if (role_skill >= P_SKILLED)
            pseudo.blessed = 1;
        await seffects(pseudo, state, env);
        break;

    // C places magic mapping and create monster after the blessed-group
    // fallthrough, so neither pseudo spellbook receives that blessing.
    case SPE_MAGIC_MAPPING:
    case SPE_CREATE_MONSTER:
        await seffects(pseudo, state, env);
        break;

    // C spell.c:spelleffects() (1572-1579). Skilled divination makes this
    // temporary spellbook blessed for the map scan; BClairvoyant blocks only
    // the effect, with the Cornuthaum message retained from the source.
    case SPE_CLAIRVOYANCE:
        if (!state.u.uprops?.[CLAIRVOYANT]?.blocked) {
            if (role_skill >= P_SKILLED) pseudo.blessed = 1;
            await do_vicinity_map(pseudo, state, env);
        } else if (state.uarmh?.otyp === CORNUTHAUM) {
            const message = env.message ?? ttyPline;
            await message(
                `You sense a pointy hat on top of your ${body_part(
                    HEAD, state.youmonst,
                )}.`,
                state,
            );
        }
        break;

    // C spell.c:spelleffects() calls dog.c:make_familiar() directly; its
    // returned monster pointer is discarded before pseudo-book cleanup.
    case SPE_CREATE_FAMILIAR:
        await make_familiar(null, state.u.ux, state.u.uy, false, {
            ...env,
            random: { d, rn1, rn2, rnd, rne, rnz, ...random },
            state,
        });
        break;

    // Potion-duplicate spells.
    case SPE_HASTE_SELF:
    case SPE_DETECT_TREASURE:
    case SPE_DETECT_MONSTERS:
    case SPE_LEVITATION:
    case SPE_RESTORE_ABILITY:
        if (role_skill >= P_SKILLED)
            pseudo.blessed = 1;
        // falls through
    case SPE_INVISIBILITY:
        await peffects(pseudo, state);
        break;

    case SPE_PROTECTION:
        // C spell.c1581–1583: feedback/state complete before common cleanup.
        await cast_protection(state, env);
        break;

    case SPE_JUMPING:
        // C spell.c1584–1587 consumes jump's TIME bit before common cleanup.
        if (!(await jump(Math.max(role_skill, 1), state, env) & ECMD_TIME))
            await (env.message ?? ttyPline)(nothing_happens, state);
        break;

    // C spell.c1588–1590: independent of skill; common cleanup follows.
    case SPE_CHAIN_LIGHTNING:
        await cast_chain_lightning(state, env);
        break;

    default:
        obfree(pseudo, null, { state });
        throw new UnsupportedSpellCastError(
            `spell type ${otyp} is not ported`,
        );
    }

    /* gain skill for successful cast */
    if (!force)
        use_skill(skill, spellev(spell, state), state);

    obfree(pseudo, null, { state }); /* now, get rid of it */
    return ECMD_TIME;
}

// C ref: spell.c chain-lightning queue and terrain macros (917–947).
// The queue limit stays below display.c TMP_AT_MAX_GLYPHS.
const CHAIN_LIGHTNING_LIMIT = 100;

// C ref: spell.c propagate_chain_lightning() (952–999). C passes zap by
// value; both the caller's direction and strength survive this forward step.
export async function propagate_chain_lightning(clq, sourceZap, state = game) {
    const zap = { ...sourceZap };
    zap.x += xdir[zap.dir];
    zap.y += ydir[zap.dir];
    if (clq.tail >= CHAIN_LIGHTNING_LIMIT) return;
    if (!isok(zap.x, zap.y)) return;
    const cell = state.level.at(zap.x, zap.y);
    // rm.h doormask aliases flags; door generation and mutation use flags.
    if (!(SPACE_POS(cell.typ) || cell.typ === POOL || cell.typ === MOAT
          || cell.typ === DRAWBRIDGE_UP || cell.typ === LAVAPOOL
          || (IS_DOOR(cell.typ) && !(cell.flags & (D_CLOSED | D_LOCKED)))))
        return;
    const mon = m_at(zap.x, zap.y, state);
    if (mon && mon.mpeaceful) return;
    if (mon && !Resists_Elem(mon, SHOCK_RES, state)
        && !defended(mon, AD_ELEC, state)) zap.strength = 3;
    else if (mon) zap.strength = 0;
    if (!mon && !zap.strength) return;
    for (let i = 0; i < clq.tail; i++) {
        if (clq.q[i].x === zap.x && clq.q[i].y === zap.y) return;
    }
    clq.q[clq.tail++] = zap;
    await tmp_at(DISP_CHANGE,
        zapdir_to_glyph(xdir[zap.dir], ydir[zap.dir], clq.displayed_beam, state), state);
    await tmp_at(zap.x, zap.y, state);
}

// C ref: spell.c cast_chain_lightning() (1003–1101). Process one breadth
// wave per delay, retaining C's bhitpos-based head test and Pw decrement.
export async function cast_chain_lightning(state = game, env = {}) {
    const halluc = state.u.uprops[HALLUC];
    const resistance = state.u.uprops[HALLUC_RES];
    const clq = { q: [], head: 0, tail: 0,
        displayed_beam: halluc.intrinsic && !(resistance.intrinsic || resistance.extrinsic)
            ? rn2_on_display_rng(6, state) : AD_ELEC - 1 };
    // Source TODO: no damage to the engulfer. Display RNG was already drawn.
    if (state.u.uswallow) return;
    await tmp_at(DISP_BEAM, zapdir_to_glyph(0, 1, clq.displayed_beam, state), state);
    for (let dir = 0; dir < N_DIRS; dir++) {
        await propagate_chain_lightning(clq,
            { dir, x: state.u.ux, y: state.u.uy, strength: 2 }, state);
    }
    await nh_delay_output(state);
    while (clq.head < clq.tail) {
        const delay_tail = clq.tail;
        while (clq.head < delay_tail) {
            const zap = { ...clq.q[clq.head++] };
            const mon = m_at(zap.x, zap.y, state);
            if (mon) {
                // decl.c gb starts zeroed; this may be the first ray to read
                // bhitpos. Keep its prior position once another ray sets it.
                state.gb.bhitpos ??= { x: 0, y: 0 };
                state.gn.notonhead = mon.mx !== state.gb.bhitpos.x
                    || mon.my !== state.gb.bhitpos.y;
                // C BZ_U_SPELL(AD_ELEC - 1) = 10 + AD_ELEC - 1.
                // zhitm's armor result is unused: electricity cannot destroy it.
                const { damage: dmg } = await zhitm(mon, 10 + AD_ELEC - 1, 2,
                    state, { d, rn2, rnd, ...env.random }, env);
                if (dmg) {
                    if (mon.mhp <= 0) await xkilled(mon, XKILL_GIVEMSG, state, env);
                    else {
                        await (env.message ?? ttyPline)(
                            `You shock ${mon_nam(mon, state)}${exclam(dmg)}`, state);
                        if (!canseemon(mon, state) && !state.gn.notonhead)
                            map_invisible(zap.x, zap.y, state);
                    }
                } else if (canseemon(mon, state)) {
                    await (env.message ?? ttyPline)(`${Monnam(mon, state)} resists.`, state);
                }
                if (mon.mhp > 0) {
                    state.context.forcefight++;
                    await wakeup(mon, false, { ...env, state });
                    state.context.forcefight--;
                }
            }
            if (!zap.strength) continue;
            zap.strength--;
            await propagate_chain_lightning(clq, zap, state);
            if (zap.strength < 2) zap.strength = 0;
            else if (state.u.uen > 0) state.u.uen--;
            // C DIR_LEFT then DIR_RIGHT2 relative to that left direction.
            zap.dir = (zap.dir + N_DIRS - 1) % N_DIRS;
            await propagate_chain_lightning(clq, zap, state);
            zap.dir = (zap.dir + 2) % N_DIRS;
            await propagate_chain_lightning(clq, zap, state);
        }
        await nh_delay_output(state);
    }
    await nh_delay_output(state);
    await nh_delay_output(state);
    await tmp_at(DISP_END, 0, state);
}

// C ref: spell.c docast() (820-829). The #cast command entry point. Calls
// getspell() to pick a spell, then spelleffects() to cast it.
export async function docast(state = game, env = {}) {
    const { ok, spell_no } = await getspell(state, env);
    if (ok) {
        // cmdq_add_key(CQ_REPEAT, spellet(spell_no)): the CQ_REPEAT queue is
        // not ported, so the repeat mechanism is skipped.
        return spelleffects(
            spellid(spell_no, state), false, false, state, env,
        );
    }
    return ECMD_FAIL;
}

// C ref: spell.c:1607–1615. The argument is unused; walk_path supplies it.
export function spell_aim_step(arg, x, y, state = game) {
    if (!isok(x, y)) return false;
    const cell = state.level.at(x, y);
    if (!ZAP_POS(cell.typ)
        && !(IS_DOOR(cell.typ) && (cell.doormask & D_ISOPEN))) return false;
    return true;
}

// C ref: spell.c:1619–1624. Sight and Chebyshev distance are read only.
export function can_center_spell_location(x, y, state = game) {
    if (distmin(state.u.ux, state.u.uy, x, y) > 10) return false;
    return isok(x, y) && cansee(x, y, state)
        && !IS_STWALL(state.level.at(x, y).typ);
}

// C ref: spell.c:1627–1651. Preserve dx-then-dy iteration and skip the hero.
export async function display_spell_target_positions(on_off, state = game) {
    if (on_off) {
        await tmp_at(DISP_BEAM, map_glyphinfo(cmap_to_glyph(S_goodpos, state), state), state);
        for (let dx = -10; dx <= 10; dx++)
            for (let dy = -10; dy <= 10; dy++) {
                const x = state.u.ux + dx, y = state.u.uy + dy;
                if (x === state.u.ux && y === state.u.uy) continue;
                if (can_center_spell_location(x, y, state))
                    await tmp_at(x, y, state);
            }
    } else {
        await tmp_at(DISP_END, 0, state);
    }
}

// C ref: spell.c:1655–1702. Target cancellation and water checks consume
// no blast RNG. Swallowing sets dx/dy only, preserving the source dz value.
export async function throwspell(state = game) {
    if (state.u.uinwater) {
        await ttyPline("You're joking!  In this weather?", state);
        return 0;
    } else if (Is_waterlevel(state.u.uz)) {
        await ttyPline('You had better wait for the sun to come out.', state);
        return 0;
    }
    await ttyPline('Where do you want to cast the spell?', state);
    const cc = {x:state.u.ux, y:state.u.uy};
    await getpos_sethilite(display_spell_target_positions,
        can_center_spell_location, state);
    if (await getpos(cc, true, 'the desired position', state) < 0) return 0;
    clearTtyMessageWindow(state);
    if (distmin(state.u.ux, state.u.uy, cc.x, cc.y) > 10) {
        await ttyPline('The spell dissipates over the distance!', state);
        return 0;
    } else if (state.u.uswallow) {
        await ttyPline('The spell is cut short!', state);
        await exercise(A_WIS, false, state);
        state.u.dx = state.u.dy = 0;
        return 1;
    } else {
        let mon;
        if (((cc.x !== state.u.ux || cc.y !== state.u.uy)
            && !cansee(cc.x, cc.y, state)
            && (!(mon = m_at(cc.x, cc.y, state)) || !canspotmon(mon, state)))
            || IS_STWALL(state.level.at(cc.x, cc.y).typ)) {
            await ttyPline('Your mind fails to lock onto that location!', state);
            return 0;
        }
    }
    const uc = {x:state.u.ux, y:state.u.uy};
    await walk_path(uc, cc, (arg, x, y) => spell_aim_step(arg, x, y, state), null);
    state.u.dx = cc.x;
    state.u.dy = cc.y;
    return 1;
}

// C ref: spell.c dowizcast(). The wizard command offers every usable spell
// object type, even when the hero has not learned it, and returns the forced
// cast's ECMD result to cmd.c's extended-command dispatcher.
export async function dowizcast(state = game, env = {}) {
    const items = [];
    for (let i = 0; i < MAXSPELL; ++i) {
        const spell_otyp = SPE_DIG + i;
        if (spell_otyp >= SPE_BLANK_PAPER) break;
        items.push({
            label: OBJ_NAME(objectType(spell_otyp, state), state),
            value: spell_otyp,
        });
    }

    const selected = await env.menu(items, PICK_ONE, 'Cast which spell?', state);
    if (selected !== null && selected !== undefined)
        return spelleffects(selected, false, true, state, env);
    return ECMD_OK;
}

// Thrown where spell.c reaches a casting branch this port has not reached.
export class UnsupportedSpellCastError extends Error {
    constructor(branch) {
        super(`spell casting requires ${branch}`);
        this.name = 'UnsupportedSpellCastError';
        this.branch = branch;
    }
}
