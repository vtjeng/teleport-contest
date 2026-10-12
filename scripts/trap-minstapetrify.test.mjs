import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { STONE_RES } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_COCKATRICE, PM_STONE_GOLEM } from '../js/monsters.js';
import { CORPSE } from '../js/objects.js';
import { minstapetrify } from '../js/trap.js';
import { mselftouch } from '../js/trap_effects.js';

const C_TRAP = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);
const JS_TRAP = readFileSync(new URL('../js/trap.js', import.meta.url), 'utf8');
const JS_EFFECTS = readFileSync(
    new URL('../js/trap_effects.js', import.meta.url), 'utf8',
);

function sourceFunction(source, declaration, endMarker) {
    const start = source.indexOf(declaration);
    assert.notEqual(start, -1, `missing source declaration: ${declaration}`);
    const end = source.indexOf(endMarker, start);
    assert.notEqual(end, -1, `missing source boundary: ${endMarker}`);
    return source.slice(start, end);
}

async function startedGame() {
    await runSegment({
        seed: 661237,
        datetime: '20310415092311',
        nethackrc: 'OPTIONS=name:StoneTest,role:Wizard,race:human,gender:male,'
            + 'align:neutral,!legacy,!tutorial,!splash_screen,pettype:none',
        moves: '',
    });
    return game;
}

test('minstapetrify keeps the C resistance, form, speed, and death order', () => {
    const c = sourceFunction(C_TRAP, 'minstapetrify(struct monst *mon, boolean byplayer)', '\nvoid\nselftouch(');
    const jsStart = JS_TRAP.indexOf('export async function minstapetrify(');
    const jsEnd = JS_TRAP.indexOf('\n}\n\n// C ref: trap.c selftouch()', jsStart);
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    const js = JS_TRAP.slice(jsStart, jsEnd);

    const cOrder = [
        'if (resists_ston(mon))',
        'if (poly_when_stoned(mon->data))',
        'mon_to_stone(mon);',
        'if (!vamp_stone(mon))',
        'mon_adjust_speed(mon, -3, (struct obj *) 0);',
        'if (cansee(mon->mx, mon->my))',
        'if (byplayer)',
        'gs.stoned = TRUE;',
        'xkilled(mon, XKILL_NOMSG);',
        'monstone(mon);',
    ];
    let previous = -1;
    for (const part of cOrder) {
        const index = c.indexOf(part);
        assert.ok(index > previous, `C source order lost at ${part}`);
        previous = index;
    }
    const jsOrder = [
        'if (Resists_Elem(mon, STONE_RES, state)) return;',
        'if (poly_when_stoned(mon.data, state))',
        'await mon_to_stone(mon, state, env);',
        'if (!await vamp_stone(mon, state, env)) return;',
        'await mon_adjust_speed(mon, -3, null, state, env);',
        'if (cansee(mon.mx, mon.my, state))',
        'if (byplayer)',
        'state.gs.stoned = true;',
        'await xkilled(mon, XKILL_NOMSG, state, env);',
        'await monstone(mon, state, env);',
    ];
    previous = -1;
    for (const part of jsOrder) {
        const index = js.indexOf(part);
        assert.ok(index > previous, `JavaScript source order lost at ${part}`);
        previous = index;
    }
    assert.doesNotMatch(js, /note_unported\(['"](?:mon|trap)\.c (?:mon_to_stone|vamp_stone|monstone|xkilled)/u);
});

test('mselftouch uses C corpse, lifesaving, gloves, and resistance guards', async () => {
    const c = sourceFunction(C_TRAP, 'mselftouch(\n    struct monst *mon,', '\n/* start levitating */');
    const jsStart = JS_EFFECTS.indexOf('export async function mselftouch(');
    const jsEnd = JS_EFFECTS.indexOf('\n}\n\n// C ref: trap.c steedintrap()', jsStart);
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    const js = JS_EFFECTS.slice(jsStart, jsEnd);
    assert.match(c,
        /mwep && mwep->otyp == CORPSE && touch_petrifies\(&mons\[mwep->corpsenm\]\)\s*&& !resists_ston\(mon\)/u);
    assert.match(c,
        /minstapetrify\(mon, byplayer\);[\s\S]*?!DEADMONSTER\(mon\)[\s\S]*?!which_armor\(mon, W_ARMG\)[\s\S]*?!resists_ston\(mon\)[\s\S]*?mwepgone\(mon\);/u);
    assert.match(js,
        /mwep && mwep\.otyp === CORPSE[\s\S]*?touch_petrifies\(state\.mons\?\.\[mwep\.corpsenm\]\)[\s\S]*?!Resists_Elem\(mon, STONE_RES, state\)/u);
    assert.match(js,
        /await minstapetrify\(mon, byplayer, state, env\);[\s\S]*?mon\.mhp >= 1[\s\S]*?!which_armor\(mon, W_ARMG, state\)[\s\S]*?!Resists_Elem\(mon, STONE_RES, state\)[\s\S]*?await mwepgone\(mon, env\)/u);

    await startedGame();
    const monster = {
        data: game.mons[PM_STONE_GOLEM],
        mextrinsics: 1 << (STONE_RES - 1),
        mhp: 20,
        mx: game.u.ux + 1,
        my: game.u.uy,
        mw: { otyp: CORPSE, corpsenm: PM_COCKATRICE },
    };
    const messages = [];
    await mselftouch(monster, null, true, {
        state: game,
        message: async (line) => messages.push(line),
    });
    await minstapetrify(monster, true, game);
    assert.equal(monster.mhp, 20);
    assert.deepEqual(messages, []);
    assert.equal(STONE_RES, 8);
});
