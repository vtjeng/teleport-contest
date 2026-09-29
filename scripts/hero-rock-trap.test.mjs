import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ROCKTRAP,
    Trap_Effect_Finished,
    W_ARMH,
    OBJ_INVENT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ARMOR_CLASS, HELMET, ROCK } from '../js/objects.js';
import { PM_XORN } from '../js/monsters.js';
import { passes_rocks } from '../js/mondata.js';
import { preflight_dotrap, trapeffect_selector } from '../js/trap_effects.js';

const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:RockTest,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,time',
    '',
].join('\n');

async function hero() {
    await runSegment({
        seed: 7710044,
        datetime: DATETIME,
        nethackrc: RC,
        moves: '',
    });
    game.level.traps = [];
    game.u.uhp = 100;
    game.u.uhpmax = 100;
    return game;
}

function rockTrap(state, { once = false, tseen = false } = {}) {
    const trap = {
        tx: state.u.ux,
        ty: state.u.uy,
        ttyp: ROCKTRAP,
        once,
        tseen,
        madeby_u: false,
    };
    state.level.traps.push(trap);
    return trap;
}

function effectEnv(state, damage = 6) {
    const calls = [];
    const messages = [];
    const redraws = [];
    const take = (name, answer) => {
        calls.push(name);
        return answer;
    };
    return {
        calls,
        messages,
        redraws,
        state,
        random: {
            d: (n, sides) => take(`d(${n},${sides})`, damage),
            rn1: (n, base) => take(`rn1(${n},${base})`, base),
            rn2: (bound) => take(`rn2(${bound})`, 0),
            rnd: (bound) => take(`rnd(${bound})`, 1),
            rne: (bound) => take(`rne(${bound})`, 1),
            rnl: (bound) => take(`rnl(${bound})`, 0),
            rnz: (bound) => take(`rnz(${bound})`, bound),
        },
        message: async (line) => { messages.push(line); },
        redraw: (x, y) => { redraws.push([x, y]); },
    };
}

test('dotrap preflight admits rock traps in unseen, seen, and mounted states',
    async () => {
        const state = await hero();
        for (const tseen of [false, true]) {
            assert.doesNotThrow(() => preflight_dotrap({
                ttyp: ROCKTRAP,
                tseen,
            }, state));
        }

        state.u.usteed = { mx: state.u.ux, my: state.u.uy };
        assert.doesNotThrow(() => preflight_dotrap({
            ttyp: ROCKTRAP,
            tseen: false,
        }, state));
        state.u.usteed = null;
    });

test('hero rock trap rolls damage before creating, placing, and naming its rock',
    async () => {
        const state = await hero();
        const trap = rockTrap(state);
        const env = effectEnv(state, 6);

        assert.equal(
            await trapeffect_selector(state.youmonst, trap, 0, env),
            Trap_Effect_Finished,
        );
        assert.equal(env.calls[0], 'd(2,6)', 'hero damage leads t_missile rng');
        assert.equal(trap.once, true, 'trap.c sets the one-shot bit');
        assert.equal(trap.tseen, true, 'feeltrap reveals the trap');
        assert.ok(env.messages[0].startsWith('A trap door in '));
        assert.match(env.messages[0], /falls on your head!/u);
        assert.ok(env.redraws.some(([x, y]) => x === trap.tx && y === trap.ty));
        assert.equal(state.level.objects[trap.tx][trap.ty]?.otyp, ROCK);
        assert.ok(state.u.uhp < 100, 'unprotected hero takes the rolled damage');
    });

test('a hard helmet reduces the falling-rock damage to two', async () => {
    const state = await hero();
    const trap = rockTrap(state);
    const env = effectEnv(state, 11);
    state.uarmh = {
        otyp: HELMET,
        oclass: ARMOR_CLASS,
        quan: 1,
        spe: 0,
        owornmask: W_ARMH,
        where: OBJ_INVENT,
    };

    await trapeffect_selector(state.youmonst, trap, 0, env);

    assert.ok(env.messages.includes(
        'Fortunately, you are wearing a hard helmet.',
    ));
    assert.equal(state.u.uhp, 98);
});

test('a rock passes harmlessly through a rock-passing form without a helmet',
    async () => {
        const state = await hero();
        const trap = rockTrap(state);
        const env = effectEnv(state, 11);
        state.youmonst.data = state.mons[PM_XORN];
        assert.equal(passes_rocks(state.youmonst.data), true);

        await trapeffect_selector(state.youmonst, trap, 0, env);

        assert.ok(env.messages.includes('It passes harmlessly through you.'));
        assert.equal(state.u.uhp, 100);
    });

test('a helmet overrides the rock-passing form protection', async () => {
    const state = await hero();
    const trap = rockTrap(state);
    const env = effectEnv(state, 11);
    state.youmonst.data = state.mons[PM_XORN];
    state.uarmh = {
        otyp: HELMET,
        oclass: ARMOR_CLASS,
        quan: 1,
        spe: 0,
        owornmask: W_ARMH,
        where: OBJ_INVENT,
    };

    await trapeffect_selector(state.youmonst, trap, 0, env);

    assert.ok(env.messages.some((line) =>
        line.startsWith('Unfortunately, you are wearing ')));
    assert.equal(state.u.uhp, 98);
});
