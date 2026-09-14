import assert from 'node:assert/strict';
import test from 'node:test';

import { COLNO, ROWNO, THRONE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { m_at } from '../js/monst.js';
import { PM_ELVEN_MONARCH, PM_OGRE_TYRANT } from '../js/monsters.js';
import {
    BATTLE_AXE,
    ELVEN_ARROW,
    ELVEN_BOW,
    ELVEN_DAGGER,
    ELVEN_LEATHER_HELM,
    ELVEN_SHORT_SWORD,
    ELVEN_SHIELD,
    ELVEN_SPEAR,
    MACE,
    PICK_AXE,
} from '../js/objects.js';
import { loadThronemonFillRecipe } from './run-thronemon-fill.mjs';

// mongets() prepends, so each list runs newest grant first: the ceremonial
// mace mk_zoo_thronemon() adds last (mkroom.c:271) heads every ruler, and
// m_initweap()'s grants appear in reverse of the order makemon.c makes them.
//
// The three layouts were recorded against the patched C program by
// scripts/run-thronemon-fill.mjs, which compared every random-number call,
// screen, and cursor position. These values name the C branch each layout
// reaches so a later change that silently picks a different arm still fails.
const EXPECTED = new Map([
    // D:10's seed 14 rolls in the monarch band and exercises the bow,
    // arrow-stack, shield, spear, dagger, and pick-axe arms in makemon.c.
    [14, {
        pmidx: PM_ELVEN_MONARCH,
        minvent: [MACE, PICK_AXE, ELVEN_SHIELD, ELVEN_SPEAR, ELVEN_DAGGER],
    }],
    // D:10's seed 55 takes the monarch bow arm and its arrow stack.
    [55, {
        pmidx: PM_ELVEN_MONARCH,
        minvent: [
            MACE, PICK_AXE, ELVEN_ARROW, ELVEN_BOW,
            ELVEN_SHORT_SWORD, ELVEN_LEATHER_HELM,
        ],
    }],
    // D:10's seed 400 takes the one-in-ten tyrant roll and its S_OGRE setup
    // chooses the battle axe.
    [400, {
        pmidx: PM_OGRE_TYRANT,
        minvent: [MACE, BATTLE_AXE],
    }],
]);

function seatedRuler(state = game) {
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            if (state.level.at(x, y)?.typ !== THRONE) continue;
            const monster = m_at(x, y, state);
            if (monster) return monster;
        }
    }
    return null;
}

test('mk_zoo_thronemon seats and arms both high-difficulty rulers',
    async () => {
        for (const segment of loadThronemonFillRecipe().segments) {
            await runSegment(segment);
            const ruler = seatedRuler();
            const expected = EXPECTED.get(segment.seed);
            assert.ok(ruler, `seed ${segment.seed} seated no ruler`);
            assert.equal(ruler.data.pmidx, expected.pmidx,
                `seed ${segment.seed} ruler species`);
            // mkroom.c:268-270 sets every ruler asleep and hostile.
            assert.equal(ruler.msleeping, true);
            assert.equal(ruler.mpeaceful, false);
            const minvent = [];
            for (let obj = ruler.minvent; obj; obj = obj.nobj) {
                minvent.push(obj.otyp);
            }
            assert.deepEqual(minvent, expected.minvent,
                `seed ${segment.seed} ruler inventory`);
        }
    });
