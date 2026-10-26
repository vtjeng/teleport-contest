import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { monkilled } from '../js/mon.js';
import { noit_mon_nam } from '../js/do_name.js';
import { AD_DCAY, AD_FIRE, AD_RUST, NON_PM, PM_IRON_GOLEM,
    PM_PAPER_GOLEM, PM_WOOD_GOLEM } from '../js/monsters.js';
import { BLINDED, ROOM } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals, vision_recalc, vision_reset } from '../js/vision.js';

// C mon.c:monkilled() prints the extra farewell only for a tame golem that
// completely burns, rusts, or rots.  The untamed versions are nearby controls.
for (const [species, attack, verb] of [
    [PM_PAPER_GOLEM, AD_FIRE, 'roast'],
    [PM_IRON_GOLEM, AD_RUST, 'rust'],
    [PM_WOOD_GOLEM, AD_DCAY, 'rot'],
]) for (const tame of [true, false]) {
    test(`golem ${species} destroyed by ${attack}: tame=${tame}`, async () => {
        await runSegment({ seed: 880276, datetime: '20320405060710',
            nethackrc: 'OPTIONS=name:GolemAudit,role:Wizard,race:human,gender=female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
            moves: ' ' });
        game.level = new GameMap();
        game.level.flags.deathdrops = true;
        for (let x = 2; x <= 8; ++x) for (let y = 2; y <= 8; ++y) {
            game.level.at(x, y).typ = ROOM;
            game.level.at(x, y).lit = true;
        }
        game.u.ux = 4; game.u.uy = 4;
        game.u.uprops[BLINDED].intrinsic = 20;
        const monster = newMonster({ data: game.mons[species],
            mnum: species, m_id: 89011, cham: NON_PM, mhp: 8,
            mhpmax: 8, mcansee: true, mcanmove: true, mtame: tame ? 10 : 0 });
        game.level.monlist = monster;
        place_monster(monster, 5, 4, game);
        light_globals_init(game);
        init_vision_globals();
        vision_reset(game);
        vision_recalc(0);
        const name = noit_mon_nam(monster, game);
        monster.mhp = 0;
        const lines = [];
        await monkilled(monster, null, attack, game, {
            message: async line => lines.push(line),
            unsupported: reason => { throw new Error(reason); },
        });
        assert.deepEqual(lines, tame ? [
            'You have a sad feeling for a moment, then it passes.',
            `May ${name} ${verb} in peace.`,
        ] : []);
    });
}
