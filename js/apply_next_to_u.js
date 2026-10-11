// Whether the hero's companions are close enough to leave the level with her.
// C refs: apply.c mleashed_next2u() and next_to_u().

import { RLOC_NOMSG } from './const.js';
import { get_mleash, number_leashed } from './apply.js';
import { game } from './gstate.js';
import { update_inventory } from './invent.js';
import { m_next2u } from './mhitu.js';
import { get_iter_mons_async, mnexto } from './mon.js';
import { heroUnaware } from './pline.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { mon_has_amulet } from './wizard.js';

// C ref: apply.c mleashed_next2u() (891-918). mnexto() is awaited because
// mon.c's JS owner can prompt while placing the leashed monster.
async function mleashed_next2u(monster, state, rawEnv) {
    if (monster.mleashed) {
        if (!m_next2u(monster, state))
            await mnexto(monster, RLOC_NOMSG, { ...rawEnv, state });
        if (!m_next2u(monster, state)) {
            const leash = get_mleash(monster, state);

            if (!leash) {
                note_unported('pline.c impossible');
                return true;
            }

            if (leash.cursed) return true;
            monster.mleashed = 0;
            leash.leashmon = 0;
            update_inventory({ ...rawEnv, state });
            const subject = number_leashed(state) > 1 ? 'a' : 'the';
            const prefix = heroUnaware(state)
                ? 'You dream that you feel' : 'You feel';
            const message = rawEnv.message ?? ttyPline;
            await message(`${prefix} ${subject} leash go slack.`, state, rawEnv);
        }
    }
    return false;
}

// C ref: apply.c next_to_u() (919-930). Answers whether the hero may leave the
// level; goto_level()'s callers print "You are held back by your pet!" when it
// answers FALSE.
export async function next_to_u(state = game, rawEnv = {}) {
    if (await get_iter_mons_async(
        (monster) => mleashed_next2u(monster, state, rawEnv), state,
    )) return false;

    // C ref: apply.c:924-926, "no pack mules for the Amulet". A steed reaches
    // the following dog.c:keepdogs() transfer only after this source check.
    if (state.u.usteed && mon_has_amulet(state.u.usteed)) return false;
    return true;
}
