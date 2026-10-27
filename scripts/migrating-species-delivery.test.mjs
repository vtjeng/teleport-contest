import assert from 'node:assert/strict';
import test from 'node:test';

import { GameMap } from '../js/game.js';
import { game } from '../js/gstate.js';
import { MIGR_LEFTOVERS, MM_NOMSG, OBJ_MIGRATING, OBJ_MINVENT,
    ROOM } from '../js/const.js';
import { mon_arrive } from '../js/dog.js';
import { runSegment } from '../js/jsmain.js';
import { makemon_runtime } from '../js/makemon_create.js';
import { newMonster } from '../js/monst.js';
import { M2_ORC, NON_PM, PM_ORC } from '../js/monsters.js';
import { mksobj_migr_to_species } from '../js/obj.js';
import { ARROW, ROCK } from '../js/objects.js';

async function arrivingOrc(withLeftovers) {
    await runSegment({
        seed: 901752,
        datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:MigrationAudit,role:Valkyrie,race:human,'
            + 'gender:female,align:neutral,pettype:none,!legacy,!tutorial,'
            + '!splash_screen,!autopickup\n',
        moves: '',
    });
    game.level = new GameMap();
    for (let x = 2; x < 20; x++) for (let y = 2; y < 15; y++) {
        Object.assign(game.level.at(x, y), { typ: ROOM, lit: true, seenv: 255 });
    }
    game.u.ux = 6;
    game.u.uy = 6;
    const monster = newMonster({
        data: game.mons[PM_ORC], mnum: PM_ORC, m_id: 901752,
        cham: NON_PM, mhp: 6, mhpmax: 6, m_lev: 1,
        mcansee: true, mcanmove: true,
        // mkmaze.c:migrate_orc marks the leader to collect objects left by
        // earlier arrivals. The control is an ordinary arriving orc.
        migflags: withLeftovers ? MIGR_LEFTOVERS : 0,
    });
    const object = mksobj_migr_to_species(ARROW, M2_ORC, false, false, {
        state: game,
    });
    assert.equal(object.where, OBJ_MIGRATING);
    assert.equal(game.gm.migrating_objs, object);
    return { monster, object };
}

test('arriving orc leader receives species-marked leftovers', async () => {
    const { monster, object } = await arrivingOrc(true);
    await mon_arrive(monster, 0, { state: game });

    // C dog.c:576-579 calls dokick.c:deliver_obj_to_mon(..., DF_ALL).
    assert.equal(monster.minvent, object);
    assert.equal(object.where, OBJ_MINVENT);
    assert.equal(game.gm.migrating_objs, null);
    assert.equal(object.owornmask, 0);
    assert.equal(object.migr_species, NON_PM);
});

test('ordinary arriving orc leaves species-marked leftovers queued', async () => {
    const { monster, object } = await arrivingOrc(false);
    await mon_arrive(monster, 0, { state: game });

    assert.equal(monster.minvent, null);
    assert.equal(game.gm.migrating_objs, object);
    assert.equal(object.where, OBJ_MIGRATING);
});

test('runtime orc creation receives one waiting species object', async () => {
    await arrivingOrc(false);
    const first = game.gm.migrating_objs;
    const second = mksobj_migr_to_species(ROCK, M2_ORC, false, false, {
        state: game,
    });
    const monster = await makemon_runtime(game.mons[PM_ORC], 8, 6, MM_NOMSG, {
        state: game,
    });

    // C makemon.c:1470 asks for one; the leader's later DF_ALL call may take
    // the rest. The newest object heads the migration chain and arrives first.
    assert.ok(monster);
    assert.equal(second.where, OBJ_MINVENT);
    assert.equal(second.ocarry, monster);
    assert.equal(game.gm.migrating_objs, first);
    assert.equal(first.where, OBJ_MIGRATING);
});
