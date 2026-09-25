// Runtime spell-memory upkeep, the known-spell display, and spell casting.
// C ref: spell.c age_spells(), dovspell(), dospellmenu(), percent_success(),
// spellretention(), spelltypemnemonic(), study_book(), docast(), getspell(),
// spelleffects_check(), spelleffects(), rejectcasting(), spell_let_to_idx(),
// and spell_idx().

import {
    A_INT,
    A_STR,
    A_WIS,
    EYE,
    FACE,
    ACH_NOVL,
    ANTIMAGIC,
    CMDQ_KEY,
    CONFUSION,
    BLINDED,
    ERODE_CORRODE,
    EF_GREASE,
    EF_VERBOSE,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    HALF_PHDAM,
    LL_CONDUCT,
    MAX_SPELL_STUDY,
    NO_KILLER_PREFIX,
    NO_SPELL,
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
    STUNNED,
    TIMEOUT,
    uhim,
} from './const.js';
import { acurr, exercise } from './attrib.js';
import { cmdq_pop, getdir, set_occupation } from './cmd.js';
import { morehungry } from './eat.js';
import { more_experienced, newexplevel } from './exper.js';
import { read_tribute } from './files.js';
import { makeplural } from './fruit.js';
import { freehand } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity, losehp, nomul } from './hack.js';
import { isqrt } from './hacklib.js';
import { obfree, update_inventory, useup } from './invent.js';
import { can_chant, haseyes } from './mondata.js';
import { PM_CYCLOPS, PM_FLOATING_EYE, PM_KNIGHT, PM_WIZARD } from './monsters.js';
import { isMetallic, mksobj, objectType, weight } from './obj.js';
import { check_unpaid } from './shk.js';
import {
    MAXSPELL,
    NODIR,
    OBJ_DESCR,
    OBJ_NAME,
    QUARTERSTAFF,
    ROBE,
    SMALL_SHIELD,
    SPE_CANCELLATION,
    SPE_CONE_OF_COLD,
    SPE_CURE_BLINDNESS,
    SPE_CURE_SICKNESS,
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
    SPE_INVISIBILITY,
    SPE_KNOCK,
    SPE_LEVITATION,
    SPE_LIGHT,
    SPE_MAGIC_MISSILE,
    SPE_POLYMORPH,
    SPE_REMOVE_CURSE,
    SPE_RESTORE_ABILITY,
    SPE_SLEEP,
    SPE_SLOW_MONSTER,
    SPE_STONE_TO_FLESH,
    SPE_TELEPORT_AWAY,
    SPE_TURN_UNDEAD,
    SPE_WIZARD_LOCK,
    SPE_NOVEL,
    LENSES,
} from './objects.js';
import { rn1, rn2, rnd } from './rng.js';
import { ttyPline } from './tty_message.js';
import { livelog_printf } from './pline.js';
import {
    P_SKILL,
    SPELL_KNOWLEDGE_KEEN,
    num_spells,
    spell_skilltype,
} from './startup_skills.js';
import { make_blinded, make_confused, peffects } from './potion.js';
import { discover_object } from './o_init.js';
import { use_skill } from './weapon.js';
import { zapyourself, weffects } from './zap.js';
import { fall_asleep } from './timeout.js';
import { erode_obj } from './trap_erode_obj.js';
import { body_part } from './polyself.js';
import { noveltitle } from './do_name.js';
import { note_unported } from './unported.js';

// C ref: spell.c's spellmenu arguments. 0..MAXSPELL-1 double as svs.spl_book[]
// indices while swapping two spells; SPELLMENU_DUMP (-3) belongs to
// show_spells(), which is not ported.
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
    const random = env.random ?? { rn1, rn2, rnd };
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
        if (state === game) note_unported('wizard.c aggravate');
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
            if (state === game) note_unported('zap.c shieldeff');
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
        if (state === game) note_unported('sit.c rndcurse');
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
        useup(book, { state, hooks: {} });
        return true;
    }
    const next = state.context?.spbook?.book === book;
    await message(
        `You find yourself reading the ${next ? 'next' : 'first'} line over and over again.`,
        state,
    );
    return false;
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
        if (state === game) note_unported('spell.c deadbook');
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
        useup(book, { state, hooks: {} });
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
                    useup(spellbook, { state, hooks: {} });
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
        // C reports impossible() and returns "". No spellbook a hero can
        // learn from carries another oc_skill, so reaching this is a bug in
        // the caller rather than a game state to render.
        throw new RangeError(`Unknown spell skill, ${skill};`);
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

// C ref: spell.c dospellmenu(). Covers SPELLMENU_VIEW (the `+` listing) and
// SPELLMENU_CAST (the getspell() casting menu). The swap prompt and the
// dumplog listing pass another splaction and stop.
//
// The whole menu is built before the window owner draws anything, the shape
// display_pickinv() uses, so an unported column stops with the screen
// untouched. Returns { ok, spell_no }: `ok` is C's boolean result and
// `spell_no` is C's *spell_no out-parameter.
async function dospellmenu(prompt, splaction, state, menu) {
    if (splaction !== SPELLMENU_VIEW && splaction !== SPELLMENU_CAST)
        throw new UnsupportedSpellDisplayError('a preselected spell menu');
    // The tab-separated column layout belongs to iflags.menu_tab_sep, whose
    // options.c boolean handler is not ported.
    if (state.iflags?.menu_tab_sep)
        throw new UnsupportedSpellDisplayError('menu_tab_sep columns');
    const sep = ' ';

    // The column spacing assumes a monospaced font and a four-character
    // "a - " selector prefix. C drops the matching indent for SPELLMENU_DUMP,
    // whose entries carry no such prefix.
    let heading = `    ${'Name'.padEnd(20)} Level `
        + `${'Category'.padEnd(12)} Fail Retention`;
    if (state.wizard) heading += `${sep}${'turns'.padStart(6)}`;

    const items = [{ text: heading, heading: true }];
    for (let i = 0; i < MAXSPELL && spellid(i, state) !== NO_SPELL; ++i) {
        // C reads gs.spl_orderindx[i] when a sort has allocated it.
        // sortspells() is unported and nothing else allocates it, so the
        // index is always the slot itself.
        const splnum = i;
        let text = `${spellname(splnum, state).padEnd(20)}  `
            + `${String(spellev(splnum, state)).padStart(2)}   `
            + `${spelltypemnemonic(
                spell_skilltype(spellid(splnum, state), state),
            ).padEnd(12)} `
            + `${String(100 - percent_success(splnum, state)).padStart(3)}% `
            + `${spellretention(splnum, state).padStart(9)}`;
        // C indexes spellknow() with the loop counter rather than splnum, so
        // a sorted list shows retention turns against the wrong row.
        if (state.wizard)
            text += `${sep}${String(spellknow(i, state)).padStart(6)}`;

        // C preselects the entry whose index equals splaction, which
        // SPELLMENU_VIEW never matches.
        items.push({
            selector: spellet(splnum),
            label: text,
            value: splnum + 1, /* must be non-zero */
        });
    }

    let how = PICK_ONE;
    if (splaction === SPELLMENU_VIEW) {
        if (spellid(1, state) === NO_SPELL) {
            /* only one spell => nothing to swap with */
            how = PICK_NONE;
        } else {
            /* more than 1 spell, add an extra menu entry */
            items.push({
                selector: '+',
                label: '[sort spells]',
                value: SPELLMENU_SORT + 1,
            });
        }
    }
    /* SPELLMENU_CAST: always PICK_ONE, no [sort spells] entry */

    const chosen = await menu(items, how, prompt, state);
    // C's `*spell_no == splaction` test detects that the hero left the
    // preselected spell alone; with no preselection every answer other than
    // "nothing chosen" is a real choice.
    if (chosen != null) return { ok: true, spell_no: chosen - 1 };
    return { ok: false, spell_no: splaction };
}

// C ref: spell.c dovspell(), bound to '+'. A hero who knows no spell is told
// so; a hero who knows one or more sees the spell list. Returns whether the
// command took game time, which for this one is never.
export async function dovspell(state = game, { message, menu } = {}) {
    if (typeof message !== 'function')
        throw new TypeError('dovspell needs a message owner');
    if (spellid(0, state) === NO_SPELL) {
        await message("You don't know any spells right now.", state);
    } else {
        if (typeof menu !== 'function')
            throw new TypeError('dovspell needs a menu owner');
        // C loops until dospellmenu() answers FALSE. Both loop bodies are
        // unported, so the loop here runs at most once: the '[sort spells]'
        // entry needs spellsortmenu() and sortspells(), and picking a spell
        // starts the reordering swap through a second dospellmenu().
        const { ok, spell_no } = await dospellmenu(
            'Currently known spells', SPELLMENU_VIEW, state, menu,
        );
        if (ok) {
            throw new UnsupportedSpellDisplayError(
                spell_no === SPELLMENU_SORT
                    ? 'spellsortmenu()'
                    : 'the spell reordering swap',
            );
        }
    }
    // C frees gs.spl_orderindx and resets gs.spl_sortmode here; the port
    // allocates neither, because sortspells() is what would set them.
    return false;
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

// C ref: spell.c spelleffects_check() (1220-1380). Validates that the hero can
// cast spell `spell` (a spl_book[] index): checks that the spell is known, the
// hero has enough energy, the hero is not too hungry or weak, and the cast
// succeeds on a random roll. Hunger is charged before the success roll;
// failed casts spend half energy.
//
// Returns { abort, res, energy } where `abort` is true when the cast should not
// proceed (C returned TRUE). Only the common successful-cast path is fully
// ported; the twisted-knowledge and amulet-draining paths throw fail-closed.
async function spelleffects_check(spell, state, env) {
    const confused = Boolean(
        state.u?.uprops?.[CONFUSION]?.intrinsic,
    );
    let energy = 0;

    // Reject casting while stunned or with no free hands.
    if (spell === UNKNOWN_SPELL
        || await rejectcasting(state, env)) {
        return { abort: true, res: ECMD_OK, energy: 0 };
    }

    // SPELL_LEV_PW(lvl) = lvl * 5
    energy = spellev(spell, state) * 5; /* 5 <= energy <= 35 */

    if (spellknow(spell, state) <= 0) {
        // Twisted knowledge: spell_backfire() and random energy loss.
        throw new UnsupportedSpellCastError(
            'casting a forgotten spell (spell_backfire)',
        );
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
        return { abort: true, res: ECMD_OK, energy: 0 };
    } else if (acurr(state, A_STR) < 4
        && spellid(spell, state) !== SPE_RESTORE_ABILITY) {
        await env.message('You lack the strength to cast spells.', state);
        return { abort: true, res: ECMD_OK, energy: 0 };
    } else if (await check_capacity(
        'Your concentration falters while carrying so much stuff.', state)) {
        return { abort: true, res: ECMD_TIME, energy: 0 };
    }

    // Amulet of Yendor energy drain
    if (state.u.uhave?.amulet && state.u.uen >= energy) {
        throw new UnsupportedSpellCastError(
            'the Amulet of Yendor energy drain during casting',
        );
    }

    if (energy > state.u.uen) {
        const suffix = (state.u.uen < state.u.uenmax) ? ''
            : (energy > state.u.uenpeak) ? ' yet'
                : ' anymore';
        await env.message(
            `You don't have enough energy to cast that spell${suffix}.`,
            state,
        );
        return { abort: true, res: ECMD_OK, energy: 0 };
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
    if (confused || (rnd(100) > chance)) {
        await env.message(
            'You fail to cast the spell correctly.',
            state,
        );
        state.u.uen -= Math.trunc(energy / 2);
        state.disp = state.disp || {};
        state.disp.botl = true;
        return { abort: true, res: ECMD_TIME, energy: 0 };
    }
    return { abort: false, res: ECMD_OK, energy };
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
// and standalone spells (cure blindness, etc.) remain fail-closed.
export async function spelleffects(spell_otyp, atme, force, state = game,
    env = {}) {
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
    await exercise(A_WIS, true, state);

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
    // Skilled fireball/cone-of-cold uses throwspell()/explode(), which are
    // not ported. Unskilled falls through to the wand-duplicate path.
    case SPE_FIREBALL:
    case SPE_CONE_OF_COLD:
        if (role_skill >= P_SKILLED) {
            obfree(pseudo, null, { state });
            throw new UnsupportedSpellCastError(
                'throwspell()/explode() for skilled fireball/cone-of-cold',
            );
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

// Thrown where spell.c reads a display branch this port has not reached.
export class UnsupportedSpellDisplayError extends Error {
    constructor(branch) {
        super(`spell display requires ${branch}`);
        this.name = 'UnsupportedSpellDisplayError';
        this.branch = branch;
    }
}

// Thrown where spell.c reaches a casting branch this port has not reached.
export class UnsupportedSpellCastError extends Error {
    constructor(branch) {
        super(`spell casting requires ${branch}`);
        this.name = 'UnsupportedSpellCastError';
        this.branch = branch;
    }
}
