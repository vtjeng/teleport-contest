import { parentPort } from 'node:worker_threads';

import { its_dead } from '../../js/apply.js';
import { OBJ_FLOOR, REVIVE_MON, TIMER_OBJECT } from '../../js/const.js';
import { game } from '../../js/gstate.js';
import { runSegment } from '../../js/jsmain.js';
import { PM_NEWT } from '../../js/monsters.js';
import { newObject } from '../../js/obj.js';
import { CORPSE, ROCK } from '../../js/objects.js';
import { start_timer } from '../../js/timeout.js';
import { loadApplyStethoscopeRecipe } from '../run-apply-stethoscope.mjs';

const recipe = loadApplyStethoscopeRecipe();
const segment = recipe.segments.find(({ moves }) => moves === '.ac..');
if (!segment) throw new Error('missing ordinary stethoscope setup segment');
await runSegment({ ...segment, moves: '.' });

const x = game.u.ux - 1;
const y = game.u.uy;
const floorObject = (otyp, corpsenm = -1) => newObject({
    otyp,
    quan: 1,
    corpsenm,
    where: OBJ_FLOOR,
    ox: x,
    oy: y,
});
const lowerTimed = floorObject(CORPSE, PM_NEWT);
const separator = floorObject(ROCK);
const upperUntimed = floorObject(CORPSE, PM_NEWT);
upperUntimed.nexthere = separator;
separator.nexthere = lowerTimed;
upperUntimed.nobj = separator;
separator.nobj = lowerTimed;
game.level.objects[x][y] = upperUntimed;
game.level.objlist = upperUntimed;
start_timer(100, TIMER_OBJECT, REVIVE_MON, lowerTimed, game);

const response = { value: 0 };
const found = await its_dead(x, y, game, response);
if (!found || game._pending_message
    !== 'You determine that those unfortunate beings are mostly dead.') {
    throw new Error('timed-corpse traversal produced the wrong result');
}
parentPort?.postMessage('done');
