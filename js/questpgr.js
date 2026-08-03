// questpgr.js -- quest text and quest-artifact bookkeeping.
// C ref: questpgr.c.  Only is_quest_artifact() is ported so far; every other
// function in that file loads and formats the role's quest text, which nothing
// in this port reaches.

import { game } from './gstate.js';

// C ref: questpgr.c is_quest_artifact() (66-70).  gu.urole.questarti is the
// artifact number of the role's quest artifact and is nonzero for every role,
// so an object carrying no artifact is never one.
export function is_quest_artifact(otmp, state = game) {
    return otmp.oartifact === state.urole.questarti;
}
