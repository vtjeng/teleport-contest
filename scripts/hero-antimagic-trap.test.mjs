import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ANTI_MAGIC,
    ANTIMAGIC,
    FAINTED,
    OBJ_INVENT,
    Trap_Effect_Finished,
    W_ARMF,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ARMOR_CLASS, IRON_SHOES } from '../js/objects.js';
import {
    drain_en,
    preflight_dotrap,
    trapeffect_selector,
} from '../js/trap_effects.js';

const TRAP_C = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);
const TRAP_EFFECTS_JS = readFileSync(
    new URL('../js/trap_effects.js', import.meta.url), 'utf8',
);

const DATETIME = '20340506070809';
const RC = [
    'OPTIONS=name:FieldTest,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,time',
    '',
].join('\n');

async function initState() {
    await runSegment({ seed: 38014401, datetime: DATETIME, nethackrc: RC, moves: '' });
    return game;
}

function antiMagicTrap(state, seen = false) {
    return {
        tx: state.u.ux,
        ty: state.u.uy,
        ttyp: ANTI_MAGIC,
        tseen: seen,
        madeby_u: false,
        once: false,
    };
}

function trapEnv(state, { d = 8, rnd = [] } = {}) {
    const calls = [];
    const messages = [];
    const redraws = [];
    const draws = [...rnd];
    return {
        state,
        calls,
        messages,
        redraws,
        random: {
            d(count, sides) {
                calls.push(`d(${count},${sides})`);
                return d;
            },
            rnd(bound) {
                calls.push(`rnd(${bound})`);
                return draws.length ? draws.shift() : 1;
            },
        },
        message: async (line) => messages.push(line),
        redraw: (x, y) => redraws.push([x, y]),
    };
}

test('drain_en preserves the complete trap.c source branch order', () => {
    const cStart = TRAP_C.indexOf(
        'drain_en(int n, boolean max_already_drained)',
    );
    const cEnd = TRAP_C.indexOf('\n}\n\n/* the #untrap command', cStart) + 2;
    const jsStart = TRAP_EFFECTS_JS.indexOf(
        'export async function drain_en(',
    );
    const jsEnd = TRAP_EFFECTS_JS.indexOf('\n}\n', jsStart) + 2;
    assert.ok(cStart >= 0 && cEnd > cStart,
        'trap.c must contain the complete drain_en body');
    assert.ok(jsStart >= 0 && jsEnd > jsStart,
        'trap_effects.js must contain the complete drain_en body');
    const cBody = TRAP_C.slice(cStart, cEnd);
    const jsBody = TRAP_EFFECTS_JS.slice(jsStart, jsEnd);

    // These source-order checks pin trap.c's low-energy throttle before
    // current-energy subtraction and its max-energy underflow correction.
    const cOrder = [
        'char punct = max_already_drained ? \'!\' : \'.\';',
        'if (u.uenmax < 1)',
        'if (n > (u.uen + u.uenmax) / 3)',
        'n = rnd(n);',
        'u.uen -= n;',
        'u.uenmax -= rnd(-u.uen);',
        'u.uen = u.uenmax;',
        'You_feel("%s%c", mesg, punct);',
    ].map((source) => cBody.indexOf(source));
    assert.ok(cOrder.every((position) => position >= 0));
    assert.ok(cOrder.every((position, index) =>
        index === 0 || cOrder[index - 1] < position));

    // JavaScript keeps the same state and draw sequence while awaiting the
    // source's final You_feel message.
    const jsOrder = [
        'const punctuation = maxAlreadyDrained ? \'!\' : \'.\';',
        'if (state.u.uenmax < 1)',
        'if (n > Math.trunc((state.u.uen + state.u.uenmax) / 3))',
        'n = random.rnd(n);',
        'state.u.uen -= n;',
        'state.u.uenmax -= random.rnd(-state.u.uen);',
        'state.u.uen = state.u.uenmax;',
        'await message(`${prefix} ${text}${ending}`, state);',
    ].map((source) => jsBody.indexOf(source));
    assert.ok(jsOrder.every((position) => position >= 0));
    assert.ok(jsOrder.every((position, index) =>
        index === 0 || jsOrder[index - 1] < position));
});

test('hero anti-magic activation drains maximum and current energy in source order',
    async () => {
        const state = await initState();
        state.u.uen = 30;
        state.u.uenmax = 40;
        const trap = antiMagicTrap(state);
        const env = trapEnv(state, { d: 8, rnd: [2] });

        assert.equal(
            await trapeffect_selector(state.youmonst, trap, 0, env),
            Trap_Effect_Finished,
        );
        assert.deepEqual(env.calls, ['d(2,6)', 'rnd(4)']);
        assert.equal(state.u.uenmax, 38, 'halfd is removed from maximum energy first');
        assert.equal(state.u.uen, 24, 'the remaining drain comes from current energy');
        assert.equal(state.disp.botl, true);
        assert.equal(trap.tseen, true);
        assert.deepEqual(env.redraws, [[trap.tx, trap.ty]]);
        assert.deepEqual(env.messages, [
            'You feel your magical energy drain away!',
        ]);
    });

test('positive iron shoes are checked before the hero learns the trap',
    async () => {
        const state = await initState();
        const trap = antiMagicTrap(state);
        const shoe = {
            o_id: 801,
            otyp: IRON_SHOES,
            oclass: ARMOR_CLASS,
            quan: 1,
            spe: 2,
            owornmask: W_ARMF,
            where: OBJ_INVENT,
        };
        const priorDescriptor = Object.getOwnPropertyDescriptor(state, 'uarmf');
        let armf = shoe;
        let firstRead = true;
        Object.defineProperty(state, 'uarmf', {
            configurable: true,
            enumerable: priorDescriptor?.enumerable ?? true,
            get() {
                if (firstRead) {
                    firstRead = false;
                    assert.equal(trap.tseen, false,
                        'trap.c checks the footwear before seetrap()');
                }
                return armf;
            },
            set(value) { armf = value; },
        });
        state.invent = shoe;
        try {
            const env = trapEnv(state);
            await trapeffect_selector(state.youmonst, trap, 0, env);

            assert.equal(trap.tseen, true);
            assert.equal(shoe.spe, 1);
            assert.equal(env.calls.length, 0,
                'the shoe protection returns before either energy roll');
            assert.equal(env.messages.length, 1);
        } finally {
            if (priorDescriptor)
                Object.defineProperty(state, 'uarmf', priorDescriptor);
            else
                delete state.uarmf;
        }
    });

test('antimagic resistance applies implosion damage before energy drain',
    async () => {
        const state = await initState();
        state.u.uhp = 16;
        state.u.uhpmax = 16;
        state.u.uen = 30;
        state.u.uenmax = 40;
        state.u.uprops ??= {};
        state.u.uprops[ANTIMAGIC] = { intrinsic: 1, extrinsic: 0 };
        const trap = antiMagicTrap(state);
        const env = trapEnv(state, { d: 8, rnd: [2, 2] });

        await trapeffect_selector(state.youmonst, trap, 0, env);
        assert.deepEqual(env.calls, ['rnd(4)', 'd(2,6)', 'rnd(4)']);
        assert.equal(state.u.uhp, 14);
        assert.equal(state.u.uenmax, 38);
        assert.equal(state.u.uen, 24);
        assert.equal(env.messages[0], 'You feel sluggish.');
        assert.equal(env.messages[1], 'You feel your magical energy drain away!');
    });

test('drain_en preserves throttle and underflow RNG order', async () => {
    const state = {
        u: { uen: 3, uenmax: 9 },
        disp: {},
        multi: 0,
    };
    const calls = [];
    const messages = [];

    await drain_en(8, false, state, {
        random: {
            rnd(bound) {
                calls.push(bound);
                return bound === 8 ? 4 : 1;
            },
        },
        message: async (line) => messages.push(line),
    });

    assert.deepEqual(calls, [8, 1]);
    assert.equal(state.u.uen, 0);
    assert.equal(state.u.uenmax, 8);
    assert.equal(state.disp.botl, true);
    assert.deepEqual(messages, ['You feel your magical energy drain away!']);
});

test('drain_en uses You_feel dreaming prefix and zero-energy branch', async () => {
    const state = {
        u: { uen: 2, uenmax: 0, uhs: FAINTED },
        disp: {},
        multi: -1,
    };
    const messages = [];
    let draws = 0;

    await drain_en(7, false, state, {
        random: { rnd: () => { draws += 1; return 1; } },
        message: async (line) => messages.push(line),
    });

    assert.equal(draws, 0);
    assert.equal(state.u.uen, 0);
    assert.equal(state.u.uenmax, 0);
    assert.equal(state.disp.botl, true);
    assert.deepEqual(messages, ['You dream that you feel momentarily lethargic.']);
});

test('preflight_dotrap admits seen and mounted anti-magic traps', async () => {
    const state = await initState();
    state.u.usteed = { m_id: 901, data: { mname: 'pony' } };
    assert.doesNotThrow(() => preflight_dotrap(antiMagicTrap(state, true), state));
    state.u.usteed = null;
    assert.doesNotThrow(() => preflight_dotrap(antiMagicTrap(state), state));
});
