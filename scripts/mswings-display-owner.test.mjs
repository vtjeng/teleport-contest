import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HALLUC, IN_SIGHT, NO_WEAPON_WANTED, OBJ_MINVENT, W_WEP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mattacku } from '../js/mhitu.js';
import { PM_HUMAN } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { newObject } from '../js/obj.js';
import { LONG_SWORD, WEAPON_CLASS } from '../js/objects.js';
import { planningState } from '../js/unported_monster_actions.js';
import { rn2_on_display_rng } from '../js/rng.js';
import { compareSessionOutputs, formatReport, runJsSession } from './diff-fresh.mjs';
import { createScoringWorkspace, removeScoringWorkspace } from './scoring-workspace.mjs';

for (const planning of [true, false]) {
    test('weapon swing naming keeps its native display owner, planning=' + planning, async () => {
        await runSegment({ seed: 8432140, datetime: '20261105101500',
            nethackrc: 'OPTIONS=name:SwingOwner,role:Valkyrie,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!tips\n',
            moves: '' });
        for (const column of game.level.monsters) column.fill(null);
        game.level.monlist = null;
        game.flags.verbose = true;
        game.u.uprops[HALLUC].intrinsic = 8;
        const monster = newMonster({ data: game.mons[PM_HUMAN], mnum: PM_HUMAN,
            m_id: 6001, mx: game.u.ux + 1, my: game.u.uy,
            mux: game.u.ux, muy: game.u.uy, m_lev: 0, mhp: 30, mhpmax: 30,
            mcanmove: true, mcansee: true, weapon_check: NO_WEAPON_WANTED });
        const sword = newObject({ otyp: LONG_SWORD, oclass: WEAPON_CLASS,
            quan: 1, where: OBJ_MINVENT, owornmask: W_WEP, ocarry: monster });
        monster.mw = sword;
        monster.minvent = sword;
        place_monster(monster, monster.mx, monster.my, game);
        game.level.monlist = monster;
        const state = planning ? planningState(game) : game;
        const actor = state.level.monlist;
        state.viz_array[actor.my][actor.mx] |= IN_SIGHT;
        const liveBefore = structuredClone(game.displayCtx);
        const ownBefore = structuredClone(state.displayCtx);
        const coreBefore = structuredClone(game.coreCtx);
        const lines = [];
        await mattacku(actor, { state, planning,
            // A guaranteed miss isolates swing and miss wording from damage.
            random: { rn2: () => 1, rnd: n => n, d: n => n },
            displayRandom: n => rn2_on_display_rng(n, state),
            unsupported: reason => assert.fail(reason),
            message: async text => { lines.push(text); },
            redraw() {}, markInvisible() {}, statusRefresh: async () => {},
            wieldMonsterItem: async () => 0, throwRangedWeapon() {} });
        assert.notDeepEqual(state.displayCtx, ownBefore);
        assert.deepEqual(game.coreCtx, coreBefore);
        if (planning) {
            assert.deepEqual(game.displayCtx, liveBefore,
                'planned swing must not advance the live display RNG');
            assert.deepEqual(lines, []);
        } else {
            assert.notDeepEqual(game.displayCtx, liveBefore);
            assert.ok(lines.some(line => line.includes('swings')));
        }
    });
}

for (const name of ['swing', 'monochrome', 'before-control']) {
    test('weapon swing display owner ' + name + ' matches independent public C recording', async () => {
        const root = createScoringWorkspace(process.cwd(), []);
        try {
            const c = JSON.parse(readFileSync(new URL(
                '../recordings/mhitu.c/mswings-display-owner-' + name + '.session.json', import.meta.url)));
            const result = compareSessionOutputs(c, await runJsSession(c, root));
            assert.equal(result.passed, true, formatReport(result));
        } finally { removeScoringWorkspace(root); }
    });
}
