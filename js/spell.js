// Runtime spell-memory upkeep.
// C ref: spell.c age_spells().

import { NO_SPELL } from './const.js';
import { game } from './gstate.js';
import { MAXSPELL } from './objects.js';

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

// C ref: spell.c dovspell(), bound to '+'. A hero who knows no spell is told
// so and the command consumes no time; the reordering menu that a known spell
// opens is not ported, so it stops. Returns whether the command took game
// time, which for this one is never.
export async function dovspell(state = game, { message } = {}) {
    if (typeof message !== 'function')
        throw new TypeError('dovspell needs a message owner');
    if (spellid(0, state) !== NO_SPELL)
        throw new UnsupportedSpellDisplayError('dospellmenu()');
    await message("You don't know any spells right now.", state);
    // C frees gs.spl_orderindx here; the port has no such allocation.
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
