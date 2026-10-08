import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { LAST_PROP, OBJ_BURIED, OBJ_FLOOR, TT_BURIEDBALL, TT_NONE, TT_PIT } from '../js/const.js';
import { buried_ball, buried_ball_to_freedom } from '../js/dig.js';
import { HEAVY_IRON_BALL, IRON_CHAIN, objects_globals_init } from '../js/objects.js';

function ball(otyp, ox, oy, nobj = null) {
    return { otyp, ox, oy, nobj };
}

function state(buriedobjlist, { utrap = 0, utraptype = TT_PIT } = {}) {
    return { u: { utrap, utraptype }, level: { buriedobjlist } };
}

test('buried_ball returns a ball at the target coordinate first', () => {
    const nearby = ball(HEAVY_IRON_BALL, 11, 10);
    const direct = ball(HEAVY_IRON_BALL, 10, 10, nearby);
    const cc = { x: 10, y: 10 };

    assert.equal(buried_ball(cc, state(direct)), direct);
    assert.deepEqual(cc, { x: 10, y: 10 });
});

test('buried_ball moves the coordinate to the nearest ball within dist2 8', () => {
    const far = ball(HEAVY_IRON_BALL, 13, 10);
    const nearest = ball(HEAVY_IRON_BALL, 11, 11, far);
    const farther = ball(HEAVY_IRON_BALL, 12, 10, nearest);
    const chain = ball(IRON_CHAIN, 10, 11, farther);
    const cc = { x: 10, y: 10 };

    assert.equal(buried_ball(cc, state(chain)), nearest);
    assert.deepEqual(cc, { x: 11, y: 11 });
});

test('buried_ball keeps the first ball on a distance tie', () => {
    const second = ball(HEAVY_IRON_BALL, 9, 10);
    const first = ball(HEAVY_IRON_BALL, 11, 10, second);
    const cc = { x: 10, y: 10 };

    assert.equal(buried_ball(cc, state(first)), first);
    assert.deepEqual(cc, { x: 11, y: 10 });
});

test('buried_ball skips lookup while trapped by a different trap', () => {
    const target = ball(HEAVY_IRON_BALL, 10, 10);
    const cc = { x: 10, y: 10 };

    assert.equal(
        buried_ball(cc, state(target, { utrap: 1, utraptype: TT_PIT })), null,
    );
    assert.deepEqual(cc, { x: 10, y: 10 });
    assert.equal(
        buried_ball(cc, state(target, { utrap: 1, utraptype: TT_BURIEDBALL })),
        target,
    );
});

import { GameMap } from '../js/game.js';
import { newObject, place_object } from '../js/obj.js';
import { add_to_buried } from '../js/invent.js';

// <10,10> is an interior square. The nearby coordinate is exactly the source
// dist2<=8 boundary; both recordings and this fixture retain the ball identity.
function releaseState(ballX = 10, ballY = 10) {
    const target = { level: new GameMap(), u: {
        ux: 10, uy: 10, utrap: 24, utraptype: TT_BURIEDBALL,
        uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
            intrinsic: 0, extrinsic: 0, blocked: 0,
        })),
    } };
    objects_globals_init(target);
    const obj = newObject({ otyp: HEAVY_IRON_BALL,
        oclass: target.objects[HEAVY_IRON_BALL].oc_class,
        quan: 1, o_id: 17, ox: ballX, oy: ballY });
    add_to_buried(obj, { state: target });
    const mark = { engr_x: ballX, engr_y: ballY, nxt_engr: null };
    target.head_engr = mark;
    return { target, obj, mark };
}

test('freedom releases the same ball and trap before engraving deletion/redraw', async () => {
    const { target, obj } = releaseState();
    assert.equal(obj.where, OBJ_BURIED);
    let redraws = 0;
    await buried_ball_to_freedom(target, { redraw(x, y) {
        ++redraws;
        assert.deepEqual([x, y], [10, 10]);
        assert.equal(target.u.utrap, 0);
        assert.equal(target.u.utraptype, TT_NONE);
        assert.equal(target.head_engr, null);
        assert.equal(target.level.buriedobjlist, null);
        assert.equal(target.level.objects[x][y], obj);
    } });
    assert.equal(redraws, 1); // dig.c1978 calls newsym once after del_engr_at.
    assert.equal(obj.where, OBJ_FLOOR);
    assert.equal(target.level.objlist, obj);
    assert.equal(target.uball, undefined); // freedom never calls punish().
    assert.equal(target.uchain, undefined);
});

test('freedom uses the selected nearby ball coordinate and keeps other text', async () => {
    const { target, obj, mark } = releaseState(12, 12);
    const heroText = { engr_x: 10, engr_y: 10, nxt_engr: mark };
    target.head_engr = heroText;
    const other = newObject({ otyp: HEAVY_IRON_BALL,
        oclass: target.objects[HEAVY_IRON_BALL].oc_class,
        quan: 1, o_id: 18 });
    place_object(other, 12, 12, { state: target });
    const seen = [];
    await buried_ball_to_freedom(target, { redraw: (x, y) => seen.push([x, y]) });
    assert.deepEqual(seen, [[12, 12]]);
    assert.equal(target.head_engr, heroText);
    assert.equal(heroText.nxt_engr, null);
    assert.equal(target.level.objects[12][12], obj);
    assert.equal(obj.nexthere, other); // objects.h: heavy iron balls do not merge.
    assert.equal(obj.quan, 1);
});

test('freedom is a no-op when the ball is absent, too far, or another trap is active', async () => {
    for (const mode of ['absent', 'too far', 'other trap']) {
        const { target, obj, mark } = releaseState(mode === 'too far' ? 13 : 10);
        if (mode === 'absent') target.level.buriedobjlist = null;
        if (mode === 'other trap') target.u.utraptype = TT_PIT;
        const initialTrap = target.u.utraptype;
        await buried_ball_to_freedom(target, { redraw() { assert.fail(mode); } });
        assert.equal(obj.where, OBJ_BURIED);
        assert.equal(target.u.utrap, 24); // unchanged, independently chosen counter.
        assert.equal(target.u.utraptype, initialTrap);
        assert.equal(target.head_engr, mark);
        assert.equal(target.level.objlist, null);
    }
});


test('freedom keeps C operation order and all five production calls are awaited', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/dig.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/dig.js', import.meta.url), 'utf8');
    const cBody = c.slice(c.indexOf('buried_ball_to_freedom(void)'),
        c.indexOf('/* move objects from fobj/nexthere'));
    const jsBody = js.slice(js.indexOf('export async function buried_ball_to_freedom'),
        js.indexOf('// C ref: dig.c unearth_objs()'));
    assert.match(cBody, /obj_extract_self\(ball\);[\s\S]*place_object\(ball, cc.x, cc.y\);[\s\S]*stackobj\(ball\);[\s\S]*reset_utrap\(TRUE\);[\s\S]*del_engr_at\(cc.x, cc.y\);[\s\S]*newsym\(cc.x, cc.y\);/u);
    assert.match(jsBody, /obj_extract_self\(ball, env\);[\s\S]*place_object\(ball, cc.x, cc.y, env\);[\s\S]*stackobj\(ball, env\);[\s\S]*await reset_utrap\(true, state\);[\s\S]*del_engr_at\(cc.x, cc.y, state\);[\s\S]*redraw\(cc.x, cc.y, state\);/u);
    assert.match(cBody, /#if 0[\s\S]*stop_timer\(RUST_METAL[\s\S]*#endif/u);
    assert.doesNotMatch(jsBody, /stop_timer\(/u);
    // rg of the C call sites gives one each in read/apply/pray and two in
    // polymon. Count only calls, excluding the new import declarations.
    for (const [file, count] of [['read', 1], ['apply', 1], ['pray', 1], ['polyself', 2]]) {
        const text = readFileSync(new URL('../js/' + file + '.js', import.meta.url), 'utf8');
        assert.equal((text.match(/await buried_ball_to_freedom\(state(?:, (?:env|rawEnv))?\);/gu) ?? []).length, count);
        assert.doesNotMatch(text, /note_unported\('dig.c buried_ball_to_freedom'/u);
    }
});

test('dig.c punishment restoration and unearthing have canonical owners', async () => {
    const dig = await import('../js/dig.js');
    assert.equal(typeof dig.buried_ball_to_punishment, 'function');
    assert.equal(typeof dig.unearth_objs, 'function');
    const c = readFileSync('nethack-c/upstream/src/dig.c', 'utf8');
    assert.match(c, /obj_extract_self\(ball\);[\s\S]*punish\(ball\);[\s\S]*reset_utrap\(FALSE\);/u);
    const owner = readFileSync('js/dig.js', 'utf8');
    assert.match(owner, /await punish\(ball, state, rawEnv\);[\s\S]*await reset_utrap\(false, state\);/u);
    assert.doesNotMatch(readFileSync('js/bury.js', 'utf8'), /export function unearth_objs/u);
});

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { buried_ball_to_punishment, unearth_objs } from '../js/dig.js';
import { punish } from '../js/read.js';
import { OBJ_FREE, PIT, ROOM } from '../js/const.js';
import { maketrap, t_at } from '../js/trap.js';

async function buriedPunishmentFixture() {
    // Independent empty D:1 startup supplies C-initialized object/hero state.
    // The interior square avoids terrain effects so only reuse/order is tested.
    await runSegment({ seed: 1422891, datetime: '20541113101519',
        nethackrc: 'OPTIONS=name:ReuseTest,role:Valkyrie,race:human,gender:female,align:neutral,playmode:debug\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!debug_mongen\n',
        moves: ' ' });
    game.u.ux = 10; game.u.uy = 10;
    game.level.at(10, 10).typ = ROOM;
    game.level.objects[10][10] = null;
    game.level.buriedobjlist = null; // exclude generated buried gold from this fixture.
    game.u.utrap = 25; game.u.utraptype = TT_BURIEDBALL;
    const obj = newObject({ otyp: HEAVY_IRON_BALL,
        oclass: game.objects[HEAVY_IRON_BALL].oc_class,
        quan: 1, o_id: 991, owt: 480, ox: 10, oy: 10 });
    add_to_buried(obj, { state: game });
    game.head_engr = { engr_x: 10, engr_y: 10, nxt_engr: null };
    return obj;
}

test('punishment restoration reuses the ball, allocates only its chain, and silently resets', async () => {
    const obj = await buriedPunishmentFixture();
    const identities = game.context.ident;
    const messages = [];
    await buried_ball_to_punishment(game, { message: text => messages.push(text), redraw() {} });
    assert.equal(game.uball, obj);
    assert.equal(game.uchain.otyp, IRON_CHAIN);
    assert.equal(game.level.buriedobjlist, null);
    assert.equal(obj.where, OBJ_FLOOR);
    assert.equal(game.u.utrap, 0);
    assert.equal(game.u.utraptype, TT_NONE);
    assert.equal(game.head_engr, null);
    assert.deepEqual(messages, []); // read.c suppresses misbehavior for reuse_ball.
    assert.equal(game.uchain.o_id, identities); // only mkobj(CHAIN_CLASS) allocates.
    assert.ok([1, 2].includes(game.context.ident - identities)); // next_ident uses rnd(2).
});

test('swallowed punishment reuses a free ball without placing either object', async () => {
    const obj = await buriedPunishmentFixture();
    const { obj_extract_self } = await import('../js/invent.js');
    obj_extract_self(obj, { state: game });
    game.u.uswallow = true;
    await punish(obj, game, { message() { assert.fail('reuse is silent'); }, redraw() { assert.fail('swallowed'); } });
    assert.equal(game.uball, obj);
    assert.equal(obj.where, OBJ_FREE);
    assert.equal(game.uchain.where, OBJ_FREE);
});

test('pit creation awaits real punishment restoration before linking the trap', async () => {
    const obj = await buriedPunishmentFixture();
    const restored = maketrap(10, 10, PIT, { state: game, redraw() {} });
    assert.equal(typeof restored.then, 'function');
    assert.equal(t_at(10, 10, game), null); // C links only after unearth_objs.
    const trap = await restored;
    assert.equal(t_at(10, 10, game), trap);
    assert.equal(game.uball, obj);
    assert.equal(game.u.utrap, 0);
    assert.equal(game.head_engr, null);
});

test('ordinary unearthing remains synchronous and preserves the saved next node', async () => {
    const obj = await buriedPunishmentFixture();
    game.u.utrap = 0;
    const next = newObject({ otyp: HEAVY_IRON_BALL,
        oclass: obj.oclass, quan: 1, o_id: 992, ox: 10, oy: 10 });
    add_to_buried(next, { state: game });
    assert.equal(unearth_objs(10, 10, { state: game, redraw() {} }), undefined);
    assert.equal(game.level.buriedobjlist, null);
    assert.equal(obj.where, OBJ_FLOOR);
    assert.equal(next.where, OBJ_FLOOR);
    assert.equal(game.uball, undefined);
});

test('unearthing resumes the saved next object after asynchronous restoration', async () => {
    const obj = await buriedPunishmentFixture();
    // The ball remains the first exact-square finder result. A second ball
    // tests the ordinary exposure tail without adding unrelated timer effects.
    const next = newObject({ otyp: HEAVY_IRON_BALL,
        oclass: obj.oclass, quan: 1, o_id: 993, ox: 10, oy: 10 });
    add_to_buried(next, { state: game });
    game.level.buriedobjlist = obj; obj.nobj = next; next.nobj = null;
    await unearth_objs(10, 10, { state: game, redraw() {} });
    assert.equal(game.uball, obj);
    assert.equal(next.where, OBJ_FLOOR);
    assert.equal(game.level.buriedobjlist, null);
});

test('missing punishment ball leaves trap and engraving untouched', async () => {
    const obj = await buriedPunishmentFixture();
    game.level.buriedobjlist = null;
    const mark = game.head_engr;
    await buried_ball_to_punishment(game, { message() { assert.fail('no ball'); }, redraw() { assert.fail('no ball'); } });
    assert.equal(game.u.utrap, 25); // dig.c enters the effects only when ball!=NULL.
    assert.equal(game.u.utraptype, TT_BURIEDBALL);
    assert.equal(game.head_engr, mark);
    assert.equal(obj.where, OBJ_BURIED);
});
