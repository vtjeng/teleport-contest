import assert from 'node:assert/strict';
import test from 'node:test';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { newMonster, place_monster, m_at } from '../js/monst.js';
import { PM_URUK_HAI, NON_PM } from '../js/monsters.js';
import { ROOM, W_WEP, OBJ_FLOOR, MON_DETACH, INVIS } from '../js/const.js';
import { set_apparxy } from '../js/monmove.js';
import { make_blinded, set_itimeout } from '../js/potion.js';
import { rn2, rnd } from '../js/rng.js';
import { m_throw } from '../js/mthrowu.js';
import { mksobj, clear_dknown, place_object } from '../js/obj.js';
import { AKLYS } from '../js/objects.js';
import { add_to_minv, obj_extract_self, stackobj } from '../js/invent.js';
import { observe_object } from '../js/o_init.js';
import { setmnotwielded } from '../js/weapon.js';
import { canseemon, obj_to_glyph } from '../js/display.js';
import { vision_reset, vision_recalc, cansee } from '../js/vision.js';

// C mthrowu.c:return_from_mtoss:937-939 calls monkilled after lethal fumble.
// Enter through m_throw so extraction, flight, return and ownership are real.
for (const hp of [2, 3]) test(`${hp === 2 ? 'target' : 'control'}: returning aklys fumble at hp=${hp}`, async () => {
    await runSegment({ seed: 901728, datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:Return,role:Wizard,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n', moves: '' });
    game.level = new GameMap();
    game.level.flags.deathdrops = true;
    for (let x = 2; x < 15; x++) for (let y = 2; y < 12; y++)
        Object.assign(game.level.at(x, y), { typ: ROOM, lit: true, seenv: 255 });
    game.u.ux = 6; game.u.uy = 6;
    const mon = newMonster({ data: game.mons[PM_URUK_HAI], mnum: PM_URUK_HAI,
        m_id: 901728, cham: NON_PM, m_lev: 3, mhp: hp, mhpmax: 20,
        mconf: true, mcansee: true, mcanmove: true, mux: 0, muy: 0 });
    game.level.monlist = mon;
    place_monster(mon, 8, 6, game);
    vision_reset(game); vision_recalc(0);
    const weapon = mksobj(AKLYS, false, false, { state: game });
    add_to_minv(mon, weapon, { state: game });
    mon.mw = weapon; weapon.owornmask = W_WEP;
    await make_blinded(20, false, game);
    assert.equal(canseemon(mon, game), false);
    set_itimeout(game.u.uprops[INVIS], 20);
    const apparentRolls = [1, 2, 1], apparentBounds = [];
    set_apparxy(mon, { state: game, random: { rn2: bound => {
        apparentBounds.push(bound);
        assert.equal(bound, 3);
        assert.ok(apparentRolls.length);
        return apparentRolls.shift();
    } } });
    assert.deepEqual(apparentBounds, [3, 3, 3]);
    assert.deepEqual([mon.mux, mon.muy], [7, 6]);
    assert.equal(weapon.oartifact, 0);
    const draws = [], messages = [];
    const expectedDraws = ['rn2(5)', 'rn2(100)', 'rn2(2)', 'rnd(3)'];
    function choose(kind, bound) {
        const call = `${kind}(${bound})`;
        if (draws.length < expectedDraws.length) {
            assert.equal(call, expectedDraws[draws.length]);
            draws.push(call); return 1;
        }
        draws.push(call);
        return kind === 'rn2' ? rn2(bound) : rnd(bound);
    }
    const unexpected = () => assert.fail('unreachable operation in empty throw path');
    await m_throw(mon, 8, 6, -1, 0, 1, weapon, {
        state: game,
        random: { rn2: n => choose('rn2', n), rnd: n => choose('rnd', n) },
        canSeeMonster: canseemon, canSeeSquare: cansee, monsterAt: m_at,
        objectToGlyph: obj_to_glyph,
        temporaryDisplay: async () => {}, delayOutput: async () => {},
        clearObjectKnowledge: obj => clear_dknown(obj, game),
        observeObject: obj => observe_object(obj, game),
        extractObject: obj => obj_extract_self(obj, { state: game }),
        setMonsterNotWielded: (m, obj) => setmnotwielded(m, obj, { state: game }),
        damageValue: unexpected, hitHero: unexpected, stopOccupation: unexpected,
        shouldMulch: unexpected, floorEffects: unexpected,
        placeObject: (obj, x, y) => place_object(obj, x, y, { state: game }),
        passiveObject: unexpected, stackObject: obj => stackobj(obj, { state: game }),
        message: async line => messages.push(line),
    });
    assert.deepEqual(draws.slice(0, 4), expectedDraws);
    if (hp === 3) assert.equal(draws.length, 4);
    assert.equal(mon.mhp, hp - 2);
    assert.equal(weapon.where, OBJ_FLOOR);
    assert.deepEqual([weapon.ox, weapon.oy], [8, 6]);
    assert.equal(game.gt.thrownobj, null);
    if (hp === 2) {
        assert.equal(Boolean(mon.mstate & MON_DETACH), true);
        assert.equal(m_at(8, 6, game), null);
        assert.equal(messages.some(line => line.includes('is killed')), false);
    } else {
        assert.equal(mon.mstate & MON_DETACH, 0);
        assert.equal(m_at(8, 6, game), mon);
        assert.equal(messages.some(line => line.includes('is killed')), false);
    }
});
