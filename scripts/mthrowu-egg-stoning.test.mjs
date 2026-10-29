import assert from 'node:assert/strict';
import test from 'node:test';

import { KILLED_BY, STONED, TIMEOUT } from '../js/const.js';
import { find_delayed_killer } from '../js/end.js';
import { game } from '../js/gstate.js';
import { add_to_minv, obj_extract_self, stackobj } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { PM_COCKATRICE, PM_KEYSTONE_KOP } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { m_throw } from '../js/mthrowu.js';
import { clear_dknown, mksobj, place_object } from '../js/obj.js';
import { CREAM_PIE, EGG } from '../js/objects.js';
import { select_rwep } from '../js/weapon.js';
import { setmnotwielded } from '../js/weapon.js';

for (const { type, hit, label } of [
    { type: EGG, hit: true, label: 'target: cockatrice egg hits' },
    { type: EGG, hit: false, label: 'target: cockatrice egg misses' },
    { type: CREAM_PIE, hit: true, label: 'control: cream pie hits' },
]) {
    test(`monster missile ${label}`, async () => {
        await runSegment({
            seed: 901731,
            datetime: '20320405060710',
            nethackrc: 'OPTIONS=name:EggAudit,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen,!autopickup\n',
            moves: '',
        });
        const x = game.u.ux + 1, y = game.u.uy;
        const mon = newMonster({ data: game.mons[PM_KEYSTONE_KOP], mnum: PM_KEYSTONE_KOP,
            m_id: 901731, mhp: 20, mhpmax: 20, mcanmove: true });
        mon.nmon = game.level.monlist;
        game.level.monlist = mon;
        place_monster(mon, x, y, game);
        const missile = mksobj(type, false, false, { state: game });
        if (type === EGG) missile.corpsenm = PM_COCKATRICE;
        add_to_minv(mon, missile, { state: game });
        assert.equal(select_rwep(mon, { state: game }), missile,
            'C weapon.c selects eggs and Kops select cream pies');
        const calls = [];
        await m_throw(mon, x, y, -1, 0, 1, missile, {
            state: game,
            random: { rn2: bound => bound - 1, rnd: () => 1 },
            canSeeMonster: () => false,
            canSeeSquare: () => false,
            monsterAt: () => null,
            objectToGlyph: () => 777,
            temporaryDisplay: async () => {},
            delayOutput: async () => {},
            clearObjectKnowledge: obj => clear_dknown(obj, game),
            observeObject: () => {},
            extractObject: obj => obj_extract_self(obj, { state: game }),
            setMonsterNotWielded: (monster, obj) => setmnotwielded(monster, obj, { state: game }),
            damageValue: () => assert.fail('C egg uses thitu(8, 0), not weapon damage'),
            hitHero: (hitv, damage) => {
                calls.push([hitv, damage]);
                return hit;
            },
            stopOccupation: async () => {},
            shouldMulch: () => false,
            floorEffects: () => false,
            placeObject: (obj, px, py) => place_object(obj, px, py, { state: game }),
            passiveObject: async () => {},
            stackObject: obj => stackobj(obj, { state: game }),
            message: async () => {},
        });
        assert.deepEqual(calls, [[8, 0]]);
        assert.equal(game.u.uprops[STONED].intrinsic & TIMEOUT,
            type === EGG && hit ? 5 : 0);
        assert.equal(find_delayed_killer(STONED, game)?.format,
            type === EGG && hit ? KILLED_BY : undefined);
    });
}
