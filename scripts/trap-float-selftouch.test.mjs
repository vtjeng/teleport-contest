import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { LEVITATION, STATUE_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_COCKATRICE } from '../js/monsters.js';
import { CORPSE } from '../js/objects.js';
import { float_down } from '../js/trap.js';

const C_TRAP = readFileSync(
    new URL('../nethack-c/upstream/src/trap.c', import.meta.url), 'utf8',
);

async function setupSokobanLevitationFall() {
    await runSegment({
        seed: 9145701,
        datetime: '20340719081123',
        nethackrc: 'OPTIONS=name:FloatTouch,role:Wizard,race:human,'
            + 'gender:male,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none',
        moves: '',
    });
    // The branch depends on dungeon identity and a trap at the landing
    // square. A statue trap leaves the later activation path inert.
    game.sokoban_dnum = game.u.uz.dnum;
    game.level.traps = [{
        tx: game.u.ux, ty: game.u.uy, ttyp: STATUE_TRAP,
        tseen: true, madeby_u: false,
    }];
    game.u.uprops[LEVITATION].intrinsic = 1;
    game.uwep = { otyp: CORPSE, corpsenm: PM_COCKATRICE };
    game.nhDisplay.onEmptyQueue = () => 32;
}

test('Sokoban levitation fall touches the wielded cockatrice corpse', async () => {
    assert.match(C_TRAP,
        /float_down\(\n    long hmask,[\s\S]*?Sokoban && trap[\s\S]*?losehp\(rnd\(2\), "dangerous winds", KILLED_BY\);[\s\S]*?selftouch\("As you fall, you"\);/u);
    await setupSokobanLevitationFall();

    await float_down(1, 0, game);
    assert.equal(game.program_state.gameover, true);
    assert.equal(game.killer.name, 'a cockatrice corpse');
    assert.ok(!game.unported.has('polyself.c selftouch'));
});

test('fatal Sokoban fall damage ends before corpse contact', async () => {
    await setupSokobanLevitationFall();
    game.u.uhp = 1;

    await float_down(1, 0, game);
    assert.equal(game.program_state.gameover, true);
    assert.equal(game.killer.name, 'dangerous winds');
});
