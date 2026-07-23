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
