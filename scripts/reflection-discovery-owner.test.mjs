import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { A_WIS, IN_SIGHT, OBJ_MINVENT, W_ARMS, W_AMUL } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mon_reflects } from '../js/muse.js';
import { PM_HUMAN } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { SHIELD_OF_REFLECTION, AMULET_OF_REFLECTION } from '../js/objects.js';
import { planningState } from '../js/unported_monster_actions.js';
import { createCoreRandom, cloneIsaacContext } from '../js/rng.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const [item, otyp, mask] of [
    ['shield', SHIELD_OF_REFLECTION, W_ARMS],
    ['amulet', AMULET_OF_REFLECTION, W_AMUL],
]) {
    for (const planning of [true, false]) {
        for (const formatted of [true, false]) {
            test(item + ' reflection discovery keeps its core owner, planning=' + planning + ', formatted=' + formatted, async () => {
                await runSegment({ seed: 8432150, datetime: '20261107103000',
                    nethackrc: 'OPTIONS=name:ReflectionOwner,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',
                    moves: '' });
                for (const column of game.level.monsters) column.fill(null);
                game.level.monlist = null;
                game.u.aexe[A_WIS] = 0; // New discovery is eligible for wisdom credit.
                game.objects[otyp].oc_name_known = 0;
                const monster = newMonster({ data: game.mons[PM_HUMAN], mnum: PM_HUMAN,
                    m_id: 6101, mx: game.u.ux + 1, my: game.u.uy,
                    mhp: 30, mhpmax: 30, mcanmove: true, mcansee: true });
                const object = newObject({ otyp, oclass: game.objects[otyp].oc_class,
                    quan: 1, where: OBJ_MINVENT, owornmask: mask, ocarry: monster });
                monster.minvent = object;
                monster.misc_worn_check = mask;
                place_monster(monster, monster.mx, monster.my, game);
                game.level.monlist = monster;
                const state = planning ? planningState(game) : game;
                const actor = state.level.monlist;
                state.viz_array[actor.my][actor.mx] |= IN_SIGHT;
                // The real planner supplies a separate core context through its environment.
                const ownedCore = planning ? cloneIsaacContext(game.coreCtx) : game.coreCtx;
                const liveBefore = structuredClone(game.coreCtx);
                const ownBefore = structuredClone(ownedCore);
                const lines = [];
                const format = formatted ? 'Reflection from %s %s.' : null;
                assert.equal(await mon_reflects(actor, format, state, { planning,
                    random: createCoreRandom(ownedCore, state),
                    message: planning ? async () => {} : async text => { lines.push(text); },
                }), true);
                if (formatted) {
                    assert.notDeepEqual(ownedCore, ownBefore,
                        'discovery must advance the caller core RNG');
                    assert.equal(state.objects[otyp].oc_name_known, 1);
                } else {
                    assert.deepEqual(ownedCore, ownBefore);
                    assert.equal(state.objects[otyp].oc_name_known, 0);
                }
                if (planning) {
                    assert.deepEqual(game.coreCtx, liveBefore,
                        'planned discovery must not advance live core RNG');
                    assert.equal(game.objects[otyp].oc_name_known, 0);
                    assert.equal(game.u.aexe[A_WIS], 0);
                    assert.deepEqual(lines, []);
                } else {
                    assert.equal(lines.length, formatted ? 1 : 0);
                }
            });
        }
    }
}

for (const name of ['reflection', 'monochrome', 'before-control']) {
    test('reflection discovery owner ' + name + ' matches independent public C recording', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(readFileSync(new URL(
                '../recordings/muse.c/reflection-discovery-owner-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
