import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { M_ATTK_HIT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { PM_FIRE_GIANT } from '../js/monsters.js';
import { mhitm_knockback } from '../js/uhitm.js';
import { planningState } from '../js/unported_monster_actions.js';

// The admitted v64 prefix creates and mounts a saddled pony via actual game
// commands. A giant is then created by the normal runtime constructor.
async function mountedAttackState() {
    const path = new URL(
        '../challenges/cases/v64/v64-mounted-controlled-horse-action4.session.json',
        import.meta.url,
    );
    const source = JSON.parse(readFileSync(path, 'utf8')).segments[0];
    const moves = source.moves.slice(0, source.moves.indexOf('zo>horse'));
    assert.notEqual(moves, source.moves);
    await runSegment({
        seed: source.seed,
        datetime: source.datetime,
        nethackrc: source.nethackrc
            .replace(',monpolycontrol', '')
            .replace(',debug_mongen', ''),
        moves,
    });
    assert.ok(game.u.usteed);
    const giant = await makemon_runtime(game.mons[PM_FIRE_GIANT],
        game.u.ux, game.u.uy - 1, 0, { state: game });
    assert.ok(giant);
    const planned = planningState(game);
    let plannedGiant = planned.level.monlist;
    while (plannedGiant && plannedGiant.m_id !== giant.m_id)
        plannedGiant = plannedGiant.nmon;
    assert.ok(plannedGiant);
    assert.ok(planned.u.usteed);
    return { planned, plannedGiant };
}

for (const [name, secondRoll, shouldKnock] of [
    ['target', 0, true],
    ['control', 1, false],
]) {
    test(`${name}: planned giant knockback preserves C dismount handoff`, async () => {
        const { planned, plannedGiant } = await mountedAttackState();
        const bounds = [];
        const rolls = [1, secondRoll, 0, 0, 1];
        const random = { rn2(bound) {
            bounds.push(bound);
            assert.ok(rolls.length);
            return rolls.shift();
        } };
        let handoff = false;
        const marker = new Error('live dismount handoff');
        let caught = null;
        try {
            await mhitm_knockback(
                plannedGiant, planned.youmonst, plannedGiant.data.mattk[0],
                { value: M_ATTK_HIT }, false, planned,
                {
                    state: planned, planning: true,
                    message: async () => {},
                    requestPlanningInput() {
                        handoff = true;
                        throw marker;
                    },
                },
                random,
            );
        } catch (error) {
            caught = error;
        }
        if (caught) assert.equal(caught, marker);
        assert.equal(Boolean(game.u.usteed), true,
            'the planning clone cannot change the live ride');
        if (shouldKnock) {
            // C uhitm.c:5389-5391 dismounts the hero for a noncursed saddle.
            // The clone must either mirror that state or explicitly ask its
            // owner to replay the effect live before later planning decisions.
            assert.ok(handoff || !planned.u.usteed);
            assert.deepEqual(bounds, handoff
                ? [3, 6, 2, 2]
                : [3, 6, 2, 2, 4]);
        } else {
            assert.equal(handoff, false);
            assert.ok(planned.u.usteed);
            assert.deepEqual(bounds, [3, 6]);
        }
    });
}
