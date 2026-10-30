import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { monkilled } from '../js/mon.js';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const expected = readFileSync(new URL('./test-fixtures/post77-golem-naming/expected.txt', import.meta.url), 'utf8').trim().split('\n');
import { AD_DCAY, AD_FIRE, AD_RUST, NON_PM, PM_IRON_GOLEM,
    PM_PAPER_GOLEM, PM_WOOD_GOLEM } from '../js/monsters.js';
import { BLINDED, ROOM } from '../js/const.js';
import { light_globals_init } from '../js/light.js';
import { init_vision_globals, vision_recalc, vision_reset } from '../js/vision.js';

test('farewell C evidence remains pinned to its source', () => {
    const provenance = JSON.parse(readFileSync(new URL('./test-fixtures/post77-golem-naming/source-provenance.json', import.meta.url)));
    for (const [path, expectedHash] of Object.entries(provenance.sha256))
        assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expectedHash, path);
});

// C mon.c:monkilled() prints the extra farewell only for a tame golem that
// completely burns, rusts, or rots.  The untamed versions are nearby controls.
for (const [species, attack, expectedIndex] of [
    [PM_PAPER_GOLEM, AD_FIRE, 0],
    [PM_IRON_GOLEM, AD_RUST, 4],
    [PM_WOOD_GOLEM, AD_DCAY, 8],
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
        monster.mhp = 0;
        const lines = [];
        await monkilled(monster, null, attack, game, {
            message: async line => lines.push(line),
            unsupported: reason => { throw new Error(reason); },
        });
        assert.deepEqual(lines, tame ? [
            'You have a sad feeling for a moment, then it passes.',
            expected[expectedIndex],
        ] : []);
    });
}
