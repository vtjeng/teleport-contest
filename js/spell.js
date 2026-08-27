// Runtime spell-memory upkeep, the known-spell display, and spell casting.
// C ref: spell.c age_spells(), dovspell(), dospellmenu(), percent_success(),
// spellretention(), spelltypemnemonic(), docast(), getspell(),
// spelleffects_check(), spelleffects(), rejectcasting(), spell_let_to_idx(),
// and spell_idx().

import {
    A_INT,
    A_STR,
    A_WIS,
    CMDQ_KEY,
    CONFUSION,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
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
    STUNNED,
} from './const.js';
import { effective_attribute, exercise } from './attrib.js';
import { cmdq_pop, getdir } from './cmd.js';
import { morehungry } from './eat.js';
import { freehand } from './engrave.js';
import { game } from './gstate.js';
import { check_capacity } from './hack.js';
import { isqrt } from './hacklib.js';
import { obfree, update_inventory } from './invent.js';
import { can_chant } from './mondata.js';
import { PM_KNIGHT, PM_WIZARD } from './monsters.js';
import { isMetallic, mksobj, objectType, weight } from './obj.js';
import {
    MAXSPELL,
    NODIR,
    OBJ_NAME,
    QUARTERSTAFF,
    ROBE,
    SMALL_SHIELD,
    SPE_CURE_BLINDNESS,
    SPE_CURE_SICKNESS,
    SPE_DETECT_FOOD,
    SPE_EXTRA_HEALING,
    SPE_HEALING,
    SPE_REMOVE_CURSE,
    SPE_RESTORE_ABILITY,
} from './objects.js';
import { rnd } from './rng.js';
import {
    P_SKILL,
    SPELL_KNOWLEDGE_KEEN,
    num_spells,
    spell_skilltype,
} from './startup_skills.js';
import { use_skill } from './weapon.js';
import { zapyourself, weffects } from './zap.js';

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
// succeeds on a random roll. Deducts energy and hunger on success.
//
// Returns { abort, res, energy } where `abort` is true when the cast should not
// proceed (C returned TRUE). Only the common successful-cast path is fully
// ported; the twisted-knowledge, amulet-draining, and confused-failure paths
// throw fail-closed.
async function spelleffects_check(spell, state, env) {
    const confused = Boolean(
        state.u?.uprops?.[CONFUSION]?.intrinsic,
    );
    let energy = 0;

    // Reject casting while stunned or with no free hands.
    if (spellid(spell, state) === UNKNOWN_SPELL
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
    } else if (effective_attribute(state, A_STR) < 4
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
        let intell = effective_attribute(state, A_INT);
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

// C ref: spell.c spelleffects() (1385-1603). Casts the spell identified by
// spell_otyp (an object type such as SPE_HEALING). Only the healing-spell
// directional path is ported; other spell types throw fail-closed.
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
    // Directional wand-like spells: SPE_HEALING and SPE_EXTRA_HEALING are the
    // ported arm. Other wand-like spells fall through to the same directional
    // block but throw fail-closed.
    case SPE_HEALING:
    case SPE_EXTRA_HEALING:
        if (objectType(otyp, state).oc_dir !== NODIR) {
            if (otyp === SPE_HEALING || otyp === SPE_EXTRA_HEALING) {
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
                const damage = await zapyourself(pseudo, true, state);
                if (damage !== 0) {
                    throw new UnsupportedSpellCastError(
                        'losehp() from a self-zap spell',
                    );
                }
            } else {
                await weffects(pseudo, state);
            }
            update_inventory({ state });
        }
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
