// Oracle consultation. C ref: rumors.c doconsult(). Random-access rumor
// selection and outrumor() remain in the existing random_text.js group.
import { ACH_ORCL, A_WIS, BY_ORACLE, ECMD_OK, ECMD_TIME } from './const.js';
import { exercise } from './attrib.js';
import { yn_function, y_n } from './cmd.js';
import { capitalizedMonsterName } from './do_name.js';
import { more_experienced, newexplevel } from './exper.js';
import { game } from './gstate.js';
import { record_achievement } from './insight.js';
import { currency, money_cnt } from './invent.js';
import { outrumor } from './random_text.js';
import { money2mon } from './shk.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';

// C ref: rumors.c doconsult() (696-769). outoracle()'s void result is
// discarded; its text window and saved oracle list remain a named gap.
export async function doconsult(oracl, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const minor_cost = 50;
    const major_cost = 500 + 50 * state.u.ulevel;
    state.multi = 0;
    const umoney = money_cnt(state.invent);

    if (!oracl) {
        await message('There is no one here to consult.', state);
        return ECMD_OK;
    } else if (!oracl.mpeaceful) {
        await message(`${capitalizedMonsterName(oracl, state)} is in no mood for consultations.`, state);
        return ECMD_OK;
    } else if (!umoney) {
        await message('You have no gold.', state);
        return ECMD_OK;
    }

    let qbuf = `"Wilt thou settle for a minor consultation?" (${minor_cost} ${currency(minor_cost, state, env)})`;
    // hack.h ynq() records the answer for repeat, with 'q' as its default.
    const answer = env.ynq
        ? await env.ynq(qbuf, state)
        : await yn_function(qbuf, 'ynq', 'q', true, state);
    let u_pay;
    switch (answer) {
    default:
    case 0x71: // C 'q'; yn_function returns a response byte.
        return ECMD_OK;
    case 0x79: // C 'y'.
        if (umoney < minor_cost) {
            await message("You don't even have enough gold for that!", state);
            return ECMD_OK;
        }
        u_pay = minor_cost;
        break;
    case 0x6e: // C 'n'.
        // C decl.c initializes go.oracle_flg and svo.oracle_cnt to zero.
        // Their later mutations belong to the unported outoracle() owner.
        if (umoney <= minor_cost || state.svo?.oracle_cnt === 1
            || (state.go?.oracle_flg ?? 0) < 0)
            return ECMD_OK;
        qbuf = `"Then dost thou desire a major one?" (${major_cost} ${currency(major_cost, state, env)})`;
        if (await (env.y_n ?? y_n)(qbuf, state) !== 0x79)
            return ECMD_OK;
        u_pay = Math.min(umoney, major_cost);
        break;
    }
    money2mon(oracl, u_pay, state);
    state.disp.botl = true;
    const event = state.u.uevent;
    if (!event.major_oracle && !event.minor_oracle)
        record_achievement(ACH_ORCL, state);
    let add_xpts = 0;
    if (u_pay === minor_cost) {
        await outrumor(1, BY_ORACLE, state, env);
        if (!event.minor_oracle)
            add_xpts = Math.trunc(u_pay / (event.major_oracle ? 25 : 10));
        event.minor_oracle = true;
    } else {
        const cheapskate = u_pay < major_cost;
        note_unported('rumors.c outoracle');
        if (!cheapskate && !event.major_oracle)
            add_xpts = Math.trunc(u_pay / (event.minor_oracle ? 25 : 10));
        event.major_oracle = true;
        await exercise(A_WIS, !cheapskate, state, env.random);
    }
    if (add_xpts) {
        more_experienced(add_xpts, Math.trunc(u_pay / 50), state);
        await newexplevel(state, { ...env, message });
    }
    return ECMD_TIME;
}
