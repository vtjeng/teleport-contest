// dig.js -- what a wielded digging tool is pointed at.
// C refs: src/dig.c dig_typ().
//
// dig.c bury_an_obj() is ported in js/bury.js, which predates this file and
// keeps its own name because it also holds zap.c obj_resists().

import {
    DIGTYP_DOOR,
    DIGTYP_ROCK,
    DIGTYP_TREE,
    DIGTYP_UNDIGGABLE,
    isok,
    IS_OBSTRUCTED,
    IS_TREE,
    IS_WALL,
} from './const.js';
import { game } from './gstate.js';
import { closed_door } from './monmove.js';
import { is_axe, is_pick } from './obj.js';

// C ref: dig.c dig_typ() (167-192). Answers what digging into <x,y> with
// `otmp` would break: a door, a tree, rock, or nothing diggable at all.
// DIGTYP_UNDIGGABLE is 0, so C's callers spell the question as a plain truth
// test on the result.
//
// The axe arm (177-180) and the pick's door, tree and rock arms (186-191) are
// ported. The pick's statue arm (182-183) and boulder arm (184-185) are not:
// each asks sobj_at() and then pick_can_reach(), which needs bimanual(),
// Flying, u.utrap and trap.c conjoined_pits(). The only caller, hack.c
// domove_fight_empty(), refuses a square holding a boulder or a statue above
// the line that asks this question -- js/hack.js does it with a wider test
// than C's, sobj_at() for both rather than C's glyph reads -- so no call can
// reach either arm. Porting them belongs with use_pick_axe2(), the caller that
// can.
//
// The order of the pick's remaining arms is what dig.c's own "pick vs tree"
// comment marks. A tree is answered DIGTYP_UNDIGGABLE before IS_OBSTRUCTED()
// is asked, and TREE is obstructed, so without that arm a pick would be told
// to dig a tree as rock. The arboreal conjunct beneath it asks a separate
// question and settles only the obstructed types that are neither walls nor
// trees, which leaves the two secret ones, SDOOR and SCORR.
export function dig_typ(otmp, x, y, state = game) {
    if (!isok(x, y) || !otmp
        || (!is_pick(otmp, state) && !is_axe(otmp, state)))
        return DIGTYP_UNDIGGABLE;

    const ltyp = state.level.at(x, y).typ;
    if (is_axe(otmp, state))
        return closed_door(x, y, state) ? DIGTYP_DOOR
            : IS_TREE(ltyp, state) ? DIGTYP_TREE /* axe vs tree */
                : DIGTYP_UNDIGGABLE;
    /*assert(is_pick(otmp));*/
    return closed_door(x, y, state) ? DIGTYP_DOOR
        : IS_TREE(ltyp, state) ? DIGTYP_UNDIGGABLE /* pick vs tree */
            : (IS_OBSTRUCTED(ltyp)
               && (!state.level.flags.arboreal || IS_WALL(ltyp)))
                ? DIGTYP_ROCK
                : DIGTYP_UNDIGGABLE;
}
