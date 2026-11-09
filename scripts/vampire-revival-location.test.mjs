import assert from 'node:assert/strict';
import test from 'node:test';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { newMonster, place_monster } from '../js/monst.js';
import { vamprises } from '../js/mon.js';
import { PM_FOG_CLOUD, PM_VAMPIRE_LEADER } from '../js/monsters.js';
import { ROOM } from '../js/const.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { light_globals_init } from '../js/light.js';
import { vision_reset, vision_recalc, init_vision_globals } from '../js/vision.js';

// mon.c vamprises() announces the revival with pline_mon(), which reads the
// monster's square when it prints. A fog-cloud vampire that has engulfed the
// hero shares the hero's square until expels() moves it next to the hero, so
// the accessiblemsg prefix names that new square, never "(here)".
test('an engulfing vampire revives with its post-expels square', async () => {
    // Any start works: the test builds its own room below.
    await runSegment({ seed: 5502917, datetime: '20280304120000',
        nethackrc: 'OPTIONS=name:VampFog,role:Samurai,race:human,gender:male,align:lawful,pettype:none,!legacy,!tutorial,!splash_screen,!tips,accessiblemsg\n', moves: '' });
    // The welcome line is no part of this case; dismiss it.
    clearTtyMessageWindow(game);
    game.level = new GameMap(); game.head_engr = null;
    // An open 19x14 floor, so mnexto() has every neighbour to choose from.
    for (let x = 2; x <= 20; ++x) for (let y = 2; y <= 15; ++y)
        game.level.at(x, y).typ = ROOM;
    game.u.ux = 9; game.u.uy = 8; game.context.mon_moving = true;
    const mon = newMonster({ data: game.mons[PM_FOG_CLOUD], mnum: PM_FOG_CLOUD,
        cham: PM_VAMPIRE_LEADER, m_id: 9931, mhp: 1, mhpmax: 30,
        m_lev: 3, mcansee: true, mcanmove: true, mux: 9, muy: 8 });
    game.level.monlist = mon; place_monster(mon, 9, 8, game);
    game.u.ustuck = mon; game.u.uswallow = 1;
    light_globals_init(game); init_vision_globals(); vision_reset(game); vision_recalc(0);
    mon.mhp = 0; // mondead()'s entry condition, with the dying form still indexed.
    const lines = [];
    const revived = await vamprises(mon, game, { state: game,
        message: async (line) => lines.push(line) });
    assert.equal(revived, true);
    assert.equal(game.u.uswallow, 0);
    const dx = Math.sign(mon.mx - game.u.ux);
    const dy = Math.sign(mon.my - game.u.uy);
    assert.ok(dx || dy, 'expels() moved the vampire off the hero');
    // pline.c coord_desc() with GPCOORDS_COMFULL names an adjacent square
    // by its compass direction alone.
    const names = { '-1,-1': 'northwest', '0,-1': 'north', '1,-1': 'northeast',
        '-1,0': 'west', '1,0': 'east', '-1,1': 'southwest', '0,1': 'south',
        '1,1': 'southeast' };
    assert.deepEqual(lines, [
        `(${names[`${dx},${dy}`]}): The fog cloud suddenly reconstitutes and rises as a vampire lord!`,
    ]);
});
