import assert from 'node:assert/strict';
import test from 'node:test';

import { COULD_SEE, IN_SIGHT, OBJ_MINVENT, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { PM_GNOME, PM_NEWT, NON_PM } from '../js/monsters.js';
import { mksobj } from '../js/obj.js';
import { WAN_STRIKING } from '../js/objects.js';
import { rn2, rne, rnz } from '../js/rng.js';
import { use_offensive } from '../js/muse.js';

test('monster wand strikes give resist the active kill RNG and environment',
    async () => {
    await runSegment({
        seed: 90525079,
        datetime: '20420601121500',
        nethackrc: [
            'OPTIONS=name:MuseResist,role:Valkyrie,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '',
    });

    const y = game.u.uy;
    const attackerX = game.u.ux + 3;
    const targetX = game.u.ux + 2;
    for (let x = game.u.ux + 1; x <= attackerX; x++) {
        const loc = game.level.at(x, y);
        loc.typ = ROOM;
        loc.flags = 0;
        loc.doormask = 0;
        loc.wall_info = 0;
        game.viz_array[y][x] |= COULD_SEE | IN_SIGHT;
    }

    const attacker = newMonster({
        cham: NON_PM,
        data: game.mons[PM_GNOME],
        mnum: PM_GNOME,
        m_id: 9101,
        mx: attackerX,
        my: y,
        mux: game.u.ux,
        muy: y,
        m_lev: game.mons[PM_GNOME].mlevel,
        mhp: 8,
        mhpmax: 8,
        mcanmove: true,
        mcansee: true,
        mwandexp: true,
    });
    const wand = mksobj(WAN_STRIKING, false, false, { state: game });
    wand.where = OBJ_MINVENT;
    wand.ocarry = attacker;
    wand.spe = 2;
    attacker.minvent = wand;

    const target = newMonster({
        cham: NON_PM,
        data: game.mons[PM_NEWT],
        mnum: PM_NEWT,
        m_id: 9102,
        mx: targetX,
        my: y,
        m_lev: Math.max(1, game.mons[PM_NEWT].mlevel),
        mhp: 1,
        mhpmax: 1,
        mcanmove: true,
        mpeaceful: false,
    });
    place_monster(target, targetX, y, game);
    place_monster(attacker, attackerX, y, game);
    attacker.nmon = target;
    target.nmon = game.level.monlist;
    game.level.monlist = attacker;

    const draws = [];
    const lines = [];
    const random = {
        rn1: (bound, base) => { draws.push(['rn1', bound, base]); return base; },
        rn2: (bound) => { draws.push(['rn2', bound]); return rn2(bound); },
        rnd: (bound) => { draws.push(['rnd', bound]); return 1; },
        d: (count, sides) => {
            draws.push(['d', count, sides]);
            return count;
        },
        rne,
        rnz,
    };
    const env = {
        state: game,
        random,
        message: async (line) => {
            lines.push({ line, mUsing: game.m_using });
        },
        unsupported: (reason) => { throw new Error(reason); },
    };
    game.m_offense = { has_offense: 7, offensive: wand };

    assert.equal(await use_offensive(attacker, env), 2);

    // muse.c:1637-1641 reaches resist() while gm.m_using is true. C discards
    // resist's return, but its damage calls monkilled() with this same stream.
    assert.deepEqual(draws.slice(0, 4), [
        ['rn1', 8, 6], ['rnd', 20], ['d', 2, 12], ['rn2', 111],
    ]);
    assert.equal(target.mhp, 0, 'monkilled removes the target after damage');
    assert.equal(game.level.monsters[targetX][y], null);
    assert.equal(game.u.uconduct.killer, 0,
        'm_using selects monkilled(), not the hero-owned killed() path');
    assert.equal(game.m_using, false, 'use_offensive resets C gm.m_using');
    assert.ok(lines.some(({ line, mUsing }) =>
        mUsing && /newt is killed/u.test(line)),
    'the death message runs before muse.c clears gm.m_using');
});
