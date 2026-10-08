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
    const jsBody = js.slice(js.indexOf('export async function buried_ball_to_freedom'));
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
