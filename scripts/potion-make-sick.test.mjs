import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    A_CON, KILLED_BY, KILLED_BY_AN, NON_PM,
    SICK, SICK_ALL, SICK_NONVOMITABLE, SICK_RES, SICK_VOMITABLE, TIMEOUT,
} from '../js/const.js';
import { find_delayed_killer } from '../js/end.js';
import { make_sick } from '../js/potion.js';

const C_SOURCE = readFileSync(
    new URL('../nethack-c/upstream/src/potion.c', import.meta.url), 'utf8',
);

function sickState({ timeout = 0, type = 0, resistance = 0 } = {}) {
    const uprops = [];
    uprops[SICK] = { intrinsic: timeout, extrinsic: 0, blocked: 0 };
    uprops[SICK_RES] = { intrinsic: resistance, extrinsic: 0, blocked: 0 };
    return {
        moves: 0,
        u: {
            umonnum: NON_PM,
            umonster: NON_PM,
            usick_type: type,
            acurr: { a: [12, 12, 12, 12, 12, 12] },
            aexe: [0, 0, 0, 0, 0, 0],
            uprops,
        },
        youmonst: { data: {} },
        disp: { botl: false },
        uwep: null,
        killer: { name: '', format: KILLED_BY_AN, next: null },
    };
}

function recordingRandom(values = [1]) {
    const bounds = [];
    let next = 0;
    return {
        bounds,
        rn2(bound) {
            bounds.push(bound);
            return values[next++] ?? 0;
        },
    };
}

test('make_sick follows the whole C timeout, type, exercise and killer sequence',
    async () => {
        const signature = C_SOURCE.indexOf('make_sick(long xtime,');
        const start = C_SOURCE.lastIndexOf('\nvoid\n', signature);
        const end = C_SOURCE.indexOf('\n}\n', signature) + 2;
        assert.ok(start >= 0 && signature > start && end > signature);
        const body = C_SOURCE.slice(start, end).replace(/\s+/gu, ' ');
        assert.match(body,
            /if \(xtime > 0L\) \{ if \(Sick_resistance\) return; if \(!old\) \{ \/\* newly sick \*\/ You_feel\("deathly sick\."\);/u);
        assert.match(body,
            /set_itimeout\(&Sick, xtime\); u\.usick_type \|= type; disp\.botl = TRUE;/u);
        assert.match(body,
            /if \(u\.usick_type\) \{ \/\* only partly cured \*\/ if \(talk\) You_feel\("somewhat better\."\); set_itimeout\(&Sick, Sick \* 2\);/u);
        assert.match(body,
            /if \(Sick\) \{ exercise\(A_CON, FALSE\);[\s\S]*?if \(xtime \|\| !old \|\| !kptr\)/u);

        const state = sickState();
        const lines = [];
        const random = recordingRandom([1]);
        await make_sick(31, 'rotted corpse', true, SICK_VOMITABLE, state, {
            message: async (line) => lines.push(line),
            random,
        });

        // C stores a 31-turn timeout, ORs the food-poisoning bit, then
        // exercise(A_CON,FALSE) draws rn2(2) and subtracts the chosen value.
        assert.equal(state.u.uprops[SICK].intrinsic & TIMEOUT, 31);
        assert.equal(state.u.usick_type, SICK_VOMITABLE);
        assert.equal(state.disp.botl, true);
        assert.deepEqual(lines, ['You feel deathly sick.']);
        assert.deepEqual(random.bounds, [2]);
        assert.equal(state.u.aexe[A_CON], -1);
        const killer = find_delayed_killer(SICK, state);
        assert.deepEqual(
            { format: killer.format, name: killer.name },
            { format: KILLED_BY_AN, name: 'rotted corpse' },
        );

        // C gives wizard-created illness the distinct KILLED_BY prefix.
        const wizard = sickState();
        const wizardRandom = recordingRandom([0]);
        await make_sick(
            8, '#wizintrinsic', true, SICK_NONVOMITABLE, wizard,
            { message: async () => {}, random: wizardRandom },
        );
        assert.equal(find_delayed_killer(SICK, wizard).format, KILLED_BY);
        assert.deepEqual(wizardRandom.bounds, [2]);
    });

test('make_sick returns on resistance and preserves partial illness on cure',
    async () => {
        const resistant = sickState({ resistance: 1 });
        const resistedLines = [];
        const resistedRandom = recordingRandom();
        await make_sick(20, 'test cause', true, SICK_VOMITABLE, resistant, {
            message: async (line) => resistedLines.push(line),
            random: resistedRandom,
        });
        assert.equal(resistant.u.uprops[SICK].intrinsic & TIMEOUT, 0);
        assert.equal(resistant.u.usick_type, 0);
        assert.deepEqual(resistedLines, []);
        assert.deepEqual(resistedRandom.bounds, []);
        assert.equal(find_delayed_killer(SICK, resistant), null);

        // C receives both bits, then curing only food poisoning leaves the
        // non-vomitable illness and doubles its 11-turn timer to 22.
        const state = sickState({
            timeout: 11,
            type: SICK_VOMITABLE | SICK_NONVOMITABLE,
        });
        const original = { id: SICK, format: KILLED_BY_AN, name: 'illness' };
        state.killer.next = original;
        const lines = [];
        const random = recordingRandom([0]);
        await make_sick(0, null, true, SICK_VOMITABLE, state, {
            message: async (line) => lines.push(line),
            random,
        });
        assert.equal(state.u.uprops[SICK].intrinsic & TIMEOUT, 22);
        assert.equal(state.u.usick_type, SICK_NONVOMITABLE);
        assert.deepEqual(lines, ['You feel somewhat better.']);
        assert.equal(find_delayed_killer(SICK, state), original);
        assert.deepEqual(random.bounds, [2]);

        // C clears and deallocates the delayed killer only after the final
        // sickness bit is removed; the silent call spends no exercise draw.
        await make_sick(0, null, false, SICK_ALL, state, {
            message: async () => assert.fail('talk=false must be silent'),
            random,
        });
        assert.equal(state.u.uprops[SICK].intrinsic & TIMEOUT, 0);
        assert.equal(state.u.usick_type, 0);
        assert.equal(find_delayed_killer(SICK, state), null);
        assert.equal(state.killer.next, null);
        assert.deepEqual(random.bounds, [2]);
    });
