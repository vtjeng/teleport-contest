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
    ELVEN_CLOAK,
    ELVEN_DAGGER,
    ELVEN_LEATHER_HELM,
    ELVEN_SHIELD,
    ELVEN_SPEAR,
    MACE,
    PICK_AXE,
    WAN_DIGGING,
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
    // D:9 rolls 6..9, so mkroom.c:259-262 picks PM_ELVEN_MONARCH. Its
    // m_initweap() elf arm (makemon.c:226-256) takes the rn2(3) == 2 spear
    // case, adds a dagger, a leather helm and a cloak, and then declines the
    // pick-axe at makemon.c:258, which needs rn2(3) nonzero off an
    // earth level.
    [18, {
        pmidx: PM_ELVEN_MONARCH,
        minvent: [
            MACE, ELVEN_SHIELD, ELVEN_SPEAR, ELVEN_DAGGER,
            ELVEN_LEATHER_HELM, ELVEN_CLOAK,
        ],
    }],
    // D:12 can roll into either high band. This layout rolls 6..9 for the
    // monarch again but takes the rn2(3) == 0 bow case (makemon.c:236-242),
    // including m_initthrow()'s arrow stack, and this time does receive the
    // makemon.c:258 pick-axe.
    [23, {
        pmidx: PM_ELVEN_MONARCH,
        minvent: [
            MACE, PICK_AXE, ELVEN_ARROW, ELVEN_BOW, ELVEN_DAGGER,
            ELVEN_LEATHER_HELM,
        ],
    }],
    // D:12 rolls above 9 here, so mkroom.c:259 picks PM_OGRE_TYRANT.
    // m_initweap()'s case S_OGRE (makemon.c:446-451) divides by 3 for the
    // tyrant alone, and this layout takes that one-in-three battle axe
    // rather than the club. The wand is an ordinary mklev floor grant.
    [21, {
        pmidx: PM_OGRE_TYRANT,
        minvent: [MACE, WAN_DIGGING, BATTLE_AXE],
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
