// Runtime spell-memory upkeep and the known-spell display.
// C ref: spell.c age_spells(), dovspell(), dospellmenu(), percent_success(),
// spellretention(), and spelltypemnemonic().

import {
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
} from './const.js';
import { effective_attribute } from './attrib.js';
import { game } from './gstate.js';
import { isqrt } from './hacklib.js';
import { PM_KNIGHT } from './monsters.js';
import { isMetallic, objectType, weight } from './obj.js';
import {
    MAXSPELL,
    OBJ_NAME,
    QUARTERSTAFF,
    ROBE,
    SMALL_SHIELD,
    SPE_CURE_BLINDNESS,
    SPE_CURE_SICKNESS,
    SPE_EXTRA_HEALING,
    SPE_HEALING,
    SPE_REMOVE_CURSE,
    SPE_RESTORE_ABILITY,
} from './objects.js';
import {
    P_SKILL,
    SPELL_KNOWLEDGE_KEEN,
    spell_skilltype,
} from './startup_skills.js';

// C ref: spell.c's spellmenu arguments. 0..MAXSPELL-1 double as svs.spl_book[]
// indices while swapping two spells; SPELLMENU_CAST (-2) and SPELLMENU_DUMP
// (-3) belong to getspell() and show_spells(), which are not ported.
const SPELLMENU_VIEW = -1;
const SPELLMENU_SORT = MAXSPELL;

// C ref: spell.c's percent_success() armor penalties, which are not
// role-specific.
const uarmhbon = 4; // Metal helmets interfere with the mind
const uarmgbon = 6; // Casting channels through the hands
const uarmfbon = 2; // All metal interferes to some degree

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
    const statused = effective_attribute(state, urole.spelstat);

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

// C ref: spell.c dospellmenu(). Covers the branch `+` reaches: the
// SPELLMENU_VIEW listing, which preselects no entry. The swap prompt and the
// dumplog listing pass another splaction and stop.
//
// The whole menu is built before the window owner draws anything, the shape
// display_pickinv() uses, so an unported column stops with the screen
// untouched. Returns { ok, spell_no }: `ok` is C's boolean result and
// `spell_no` is C's *spell_no out-parameter.
async function dospellmenu(prompt, splaction, state, menu) {
    if (splaction !== SPELLMENU_VIEW)
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

// Thrown where spell.c reads a display branch this port has not reached.
export class UnsupportedSpellDisplayError extends Error {
    constructor(branch) {
        super(`spell display requires ${branch}`);
        this.name = 'UnsupportedSpellDisplayError';
        this.branch = branch;
    }
}
