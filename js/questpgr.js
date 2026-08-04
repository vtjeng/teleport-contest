// questpgr.js -- quest text and quest-artifact bookkeeping.
// C ref: questpgr.c com_pager_core(), com_pager(), convert_line(), and
// is_quest_artifact().

import { NEUTRAL } from './const.js';
import { game } from './gstate.js';
import { type_is_pname } from './mondata.js';
import { rn2 } from './rng.js';
import { ttyPline } from './tty_message.js';

// C refs: questpgr.c com_pager_core(), nhlua.c nhl_init(), dat/nhlib.lua.
// Every pager owns a fresh Lua state; loading nhlib shuffles its private
// three-entry alignment table even when the selected quest text is fixed.
export function initializeQuestPagerLua(random = rn2) {
    const align = ['law', 'neutral', 'chaos'];
    for (let index = align.length; index > 1; --index) {
        const selected = random(index);
        [align[index - 1], align[selected]] = [
            align[selected], align[index - 1],
        ];
    }
    return align;
}

function questLeaderName(state) {
    const leader = state.mons?.[state.urole?.ldrnum];
    const name = leader?.pmnames?.[NEUTRAL];
    if (!name) throw new Error('quest pager requires the role leader');
    return type_is_pname(leader) ? name : `the ${name}`;
}

const QUEST_PORTAL_LINES = Object.freeze([
    (leader) => `You receive a faint telepathic message from ${leader}:`,
    (_leader, homebase) => `Your help is urgently needed at ${homebase}!`,
    () => 'Look for a ...ic transporter.',
    () => "You couldn't quite make out that last message.",
]);

// dat/quest.lua questtext.common portal messages. These are explicitly
// `output="pline"`, so no text window is involved; each line is awaited in
// source order and can independently reach tty's More prompt.
export async function com_pager(
    messageId,
    state = game,
    { message = ttyPline, random = rn2 } = {},
) {
    initializeQuestPagerLua(random);
    const leader = questLeaderName(state);
    const homebase = state.urole?.homebase;
    let lines;
    switch (messageId) {
    case 'quest_portal':
        lines = QUEST_PORTAL_LINES.map((line) => line(leader, homebase));
        break;
    case 'quest_portal_again':
        lines = [`You again sense ${leader} pleading for help.`];
        break;
    case 'quest_portal_demand':
        lines = [`You again sense ${leader} demanding your attendance.`];
        break;
    default:
        throw new Error(`unsupported quest pager message ${messageId}`);
    }
    for (const line of lines) await message(line, state);
    return true;
}

// C ref: questpgr.c is_quest_artifact() (66-70).  gu.urole.questarti is the
// artifact number of the role's quest artifact and is nonzero for every role,
// so an object carrying no artifact is never one.
export function is_quest_artifact(otmp, state = game) {
    return otmp.oartifact === state.urole.questarti;
}
