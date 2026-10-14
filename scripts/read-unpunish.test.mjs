import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { OBJ_DELETED, OBJ_FREE, OBJ_FLOOR, W_BALL, W_CHAIN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { remove_object, newObject, place_object } from '../js/obj.js';
import { HEAVY_IRON_BALL, IRON_CHAIN, TOOL_CLASS } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { unpunish } from '../js/read.js';

test('eatspecial forwards its operation environment to the punishment release helper', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/eat.c', import.meta.url), 'utf8');
    const js = readFileSync(new URL('../js/eat.js', import.meta.url), 'utf8');
    const cFunction = c.match(/staticfn void\s+eatspecial\(void\)\s*\{([\s\S]*?)\n\}/u)?.[1];
    const jsFunction = js.match(/async function eatspecial\(state, env\)\s*\{([\s\S]*?)\n\}/u)?.[1];
    assert.ok(cFunction, 'C source has the whole eatspecial function');
    assert.ok(jsFunction, 'JavaScript source has the corresponding whole function');
    assert.match(cFunction,
        /if \(otmp == uball\)\s+unpunish\(\);[\s\S]*?if \(otmp == uchain\)\s+unpunish\(\);/u);
    assert.match(jsFunction,
        /if \(otmp === state\.uball\)\s+unpunish\(state, env\);[\s\S]*?if \(otmp === state\.uchain\)\s*\{\s*unpunish\(state, env\);/u);
});

test('unpunish clears the chain slot, deletes it, then clears the ball slot',
    async () => {
        // This seed and fixed date create an ordinary initialized game; the
        // test controls all later randomness and does not depend on map layout.
        await runSegment({
            seed: 92601173,
            datetime: '20321001112233',
            nethackrc: [
                'OPTIONS=name:Unpunish,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
                '',
            ].join('\n'),
            moves: '.',
        });

        const x = game.u.ux;
        const y = game.u.uy;
        const ball = newObject({
            otyp: HEAVY_IRON_BALL,
            oclass: TOOL_CLASS,
            where: OBJ_FREE,
            quan: 1,
            nobj: null,
            nexthere: null,
            owornmask: W_BALL,
        });
        const chain = newObject({
            otyp: IRON_CHAIN,
            oclass: TOOL_CLASS,
            where: OBJ_FREE,
            quan: 1,
            nobj: null,
            nexthere: null,
            owornmask: W_CHAIN,
        });
        place_object(ball, x, y, { state: game });
        place_object(chain, x, y, { state: game });
        game.uball = ball;
        game.uchain = chain;

        const events = [];
        const draws = [];
        unpunish(game, {
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return 0; // The ordinary iron chain has 0% resistance.
                },
            },
            hooks: {
                extractExternalObject(obj, env) {
                    events.push([
                        'extract',
                        obj === chain,
                        game.uchain,
                        game.uball,
                    ]);
                    return remove_object(obj, env);
                },
                newsym(px, py) {
                    events.push(['redraw', px, py, game.uchain, game.uball]);
                },
            },
        });

        assert.deepEqual(draws, [100]);
        assert.equal(events.length, 2);
        assert.deepEqual(events[0], ['extract', true, null, ball]);
        assert.deepEqual(events[1], ['redraw', x, y, null, ball]);
        assert.equal(game.uchain, null);
        assert.equal(game.uball, null);
        assert.equal(chain.where, OBJ_DELETED);
        assert.equal(chain.owornmask, 0);
        assert.equal(ball.where, OBJ_FLOOR);
        assert.equal(ball.owornmask, 0);
    });
