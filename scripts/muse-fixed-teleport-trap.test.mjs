import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { ROOM, TELEP_TRAP } from '../js/const.js';
import { PM_GOBLIN } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { maketrap } from '../js/trap.js';
import { find_defensive, use_defensive } from '../js/muse.js';

test('defensive teleport trap honors fixed and occupied destinations', async () => {
    for (const scenario of ['ordinary', 'fixed', 'blocked']) {
        const fixed = scenario !== 'ordinary';
        await runSegment({ seed: 9701163, datetime: '20490417141500',
            nethackrc: 'OPTIONS=name:TrapAudit,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
            moves: '' });
        game.level = new GameMap();
        for (let x = 2; x < 16; ++x) for (let y = 2; y < 12; ++y)
            Object.assign(game.level.at(x, y), { typ: ROOM, lit: true, seenv: 255 });
        game.u.ux = 6; game.u.uy = 6;
        const monster = newMonster({ data: game.mons[PM_GOBLIN], mnum: PM_GOBLIN,
            m_id: 9701163, mx: 9, my: 6, mux: 6, muy: 6,
            mhp: 1, mhpmax: 8, mcanmove: true, mcansee: true });
        game.level.monlist = monster;
        place_monster(monster, 9, 6, game);
        if (fixed) game.launchplace = { x: 14, y: 6 };
        const trap = maketrap(10, 6, TELEP_TRAP, { state: game });
        game.launchplace = { x: 0, y: 0 };
        assert.ok(trap);
        assert.deepEqual([trap.teledest.x, trap.teledest.y], fixed ? [14, 6] : [-1, -1]);
        if (scenario === 'blocked') {
            const occupant = newMonster({ data: game.mons[PM_GOBLIN], mnum: PM_GOBLIN,
                m_id: 9701164, mx: 14, my: 6, mhp: 8, mhpmax: 8 });
            occupant.nmon = game.level.monlist;
            game.level.monlist = occupant;
            place_monster(occupant, 14, 6, game);
        }
        const choice = find_defensive(monster, false, { state: game });
        assert.equal(choice?.kind, 'teleport trap');
        assert.deepEqual([choice.x, choice.y], [10, 6]);
        assert.equal(await use_defensive(monster, choice, game), 2);
        // C muse.c:m_tele -> trap.c:mintrap -> teleport.c:mtele_trap.
        // A fixed destination is used unless another monster occupies it.
        if (scenario === 'fixed')
            assert.deepEqual([monster.mx, monster.my], [14, 6]);
        else if (scenario === 'blocked')
            assert.deepEqual([monster.mx, monster.my], [10, 6]);
        else assert.notDeepEqual([monster.mx, monster.my], [9, 6]);
    }
});
