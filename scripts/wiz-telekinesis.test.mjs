import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as wiz from '../js/wizcmds.js';
import { ECMD_OK, ECMD_CANCEL, UTOTYPE_NONE } from '../js/const.js';

// Interior coordinates avoid the source x<1 cancellation gate; direction
// components and range below pin wizcmds.c's fixed six-square hurtle call.
const fixture = () => ({ u: { ux: 10, uy: 8, dx: 1, dy: -1, utotype: UTOTYPE_NONE } });
function operations(state, selections, extra = {}) {
    const seen = [];
    return { seen, message: async text => seen.push(['message', text]),
        getpos: async (cc, force, goal, s) => {
            assert.equal(s, state); assert.equal(force, true); assert.equal(goal, 'a monster');
            seen.push(['selection', cc.x, cc.y]);
            const next = selections.shift(); assert.ok(next, 'fixture supplies every selection boundary');
            Object.assign(cc, next); return next.ans ?? 0;
        },
        getdir: async (prompt, s) => { assert.equal(prompt, 'which direction?'); assert.equal(s, state); return true; },
        m_at: () => null, canspotmon: () => false, ...extra };
}
test('telekinesis preserves source monster movement order and recenters only a living visible target', async () => {
    assert.equal(typeof wiz.wiz_telekinesis, 'function');
    const state = fixture(); const monster = { mx: 11, my: 8, mhp: 5 }; // Positive hp is the source !DEADMONSTER gate.
    const env = operations(state, [{ x: 11, y: 8 }, { ans: -1 }], {
        m_at: () => monster, canspotmon: () => true,
        mhurtle: async (mon, dx, dy, range, e) => {
            assert.equal(mon, monster); assert.deepEqual([dx, dy, range], [1, -1, 6]); assert.equal(e.state, state);
            monster.mx = 17; monster.my = 2; // Six east/north steps establish the next selection coordinate.
        },
    });
    assert.equal(await wiz.wiz_telekinesis(state, env), ECMD_CANCEL);
    assert.deepEqual(env.seen, [['message', 'Pick a monster to hurtle.'], ['selection', 10, 8], ['selection', 17, 2]]);
});
test('dead or hidden monsters keep the prior selection and an empty square never asks for direction', async () => {
    assert.equal(typeof wiz.wiz_telekinesis, 'function');
    for (const dead of [false, true]) {
        const state = fixture(); const monster = { mx: 11, my: 8, mhp: 5 };
        let moved = false, directions = 0;
        const env = operations(state, [{ x: 12, y: 8 }, { x: 11, y: 8 }, { ans: -1 }], {
            m_at: x => x === 11 ? monster : null,
            canspotmon: () => !moved,
            getdir: async () => { directions++; return true; },
            mhurtle: async () => { moved = true; monster.mx = 17; monster.mhp = dead ? 0 : 5; },
        });
        assert.equal(await wiz.wiz_telekinesis(state, env), ECMD_CANCEL);
        assert.equal(directions, 1, 'empty square bypasses getdir');
        assert.deepEqual(env.seen.at(-1), ['selection', 11, 8], 'source does not recenter a dead or no-longer-visible monster');
    }
});
test('hero hurtle recenters and deferred level change exits with ECMD_OK', async () => {
    assert.equal(typeof wiz.wiz_telekinesis, 'function');
    const state = fixture(); const env = operations(state, [{ x: 10, y: 8 }, { ans: -1 }], {
        hurtle: async (dx, dy, range, verbose, s) => { assert.equal(s, state); assert.deepEqual([dx, dy, range, verbose], [1, -1, 6, false]); state.u.ux = 16; state.u.uy = 2; },
    });
    assert.equal(await wiz.wiz_telekinesis(state, env), ECMD_CANCEL);
    assert.deepEqual(env.seen.at(-1), ['selection', 16, 2]);
    const changing = fixture(); const exit = operations(changing, [{ x: 10, y: 8 }], {
        hurtle: async () => { changing.u.utotype = 1; }, // Any nonzero deferred goto flag exits C's UTOTYPE_NONE loop.
    });
    assert.equal(await wiz.wiz_telekinesis(changing, exit), ECMD_OK);
});
test('source cancellation gates and monster on hero square retain the assigned monster', async () => {
    assert.equal(typeof wiz.wiz_telekinesis, 'function');
    for (const selection of [{ ans: -1 }, { x: 0 }]) {
        const state = fixture(); const env = operations(state, [selection], { getdir: async () => assert.fail('cancel before direction') });
        assert.equal(await wiz.wiz_telekinesis(state, env), ECMD_CANCEL);
    }
    const state = fixture(); const mon = { mx: 10, my: 8, mhp: 5 };
    const env = operations(state, [{ x: 10, y: 8 }], { m_at: () => mon, getdir: async () => false, mhurtle: async () => assert.fail('direction cancellation precedes movement') });
    assert.equal(await wiz.wiz_telekinesis(state, env), ECMD_CANCEL);
    let captured;
    const mounted = fixture(); const gate = operations(mounted, [{ x: 10, y: 8 }], {
        m_at: () => mon, mhurtle: async target => { captured = target; mounted.u.utotype = 1; },
        hurtle: async () => assert.fail('source keeps m_at result even when hero-square gate admits target'),
    });
    assert.equal(await wiz.wiz_telekinesis(mounted, gate), ECMD_OK); assert.equal(captured, mon);
    const c = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
    assert.match(c, /mhurtle\(mtmp, u\.dx, u\.dy, 6\)/u);
    assert.match(c, /hurtle\(u\.dx, u\.dy, 6, FALSE\)/u);
    assert.match(c, /while \(u\.utotype == UTOTYPE_NONE\)/u);
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(js, /case 'wiz_telekinesis':\s+return await wiz_telekinesis\(state\);/u);
});
