// C vault.c:gd_move() newpos picks up pre-existing gold and reports the
// visible guard doing so. This initialized-game fixture is source-grounded;
// it is not a fresh C gameplay recording.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ROOM, ROOMOFFSET, VAULT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { money_cnt } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { PM_GUARD } from '../js/monsters.js';
import { place_monster } from '../js/monst.js';
import { g_at, mkgold } from '../js/obj.js';
import { gd_move, newegd, vault_occupied } from '../js/vault.js';

for (const hasGold of [false, true]) {
    test(`vault guard enters new square with pre-existing gold: ${hasGold}`, async () => {
        await runSegment({
            seed: 990700,
            datetime: '20260724120000',
            nethackrc: 'OPTIONS=name:VaultTest,role:Wizard,race:human,gender:female,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup,!debug_mongen\n',
            moves: ' ',
        });
        assert.equal(money_cnt(game.invent), 0);
        const { ux, uy } = game.u;
        const gx = ux + 1, gy = uy, nx = gx + 1, ny = gy;
        // The hero is in a bounded vault, the guard stands at its edge, and
        // its next corridor square is outside that room.
        Object.assign(game.level.rooms[0], {
            rtype: VAULT, lx: ux - 1, hx: ux, ly: uy - 1, hy: uy + 1,
        });
        game.u.urooms = [ROOMOFFSET, 0, 0, 0, 0];
        assert.equal(vault_occupied(game.u.urooms, game), ROOMOFFSET);
        const guard = {
            isgd: true, mpeaceful: 1, mx: gx, my: gy,
            mhp: 12, mhpmax: 12, m_id: 900, mstate: 0,
            nmon: game.level.monlist, mextra: {}, data: game.mons[PM_GUARD],
        };
        newegd(guard);
        const egd = guard.mextra.egd;
        egd.gdlevel = { ...game.u.uz };
        egd.ogx = gx; egd.ogy = gy;
        egd.gdx = gx + 5; egd.gdy = gy;
        egd.fcbeg = 0; egd.fcend = 2;
        egd.fakecorr[0] = { fx: gx, fy: gy, ftyp: ROOM, flags: 0 };
        egd.fakecorr[1] = { fx: gx - 1, fy: gy, ftyp: ROOM, flags: 0 };
        game.level.monlist = guard;
        place_monster(guard, gx, gy, game);
        game.level.at(nx, ny).typ = ROOM;
        if (hasGold) mkgold(100, nx, ny, { state: game });
        const messages = [];
        const result = await gd_move(guard, {
            state: game,
            random: { rn2: () => 1 },
            message: async line => messages.push(line),
        });
        assert.equal(result, 1);
        assert.deepEqual([guard.mx, guard.my], [nx, ny]);
        assert.equal(g_at(nx, ny, game), null);
        assert.equal(money_cnt(guard.minvent), hasGold ? 100 : 0);
        if (hasGold) assert.deepEqual(messages, ['The guard picks up some gold.']);
        else assert.deepEqual(messages, []);
    });
}
