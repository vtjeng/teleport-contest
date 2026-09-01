// fountain.c dowatersnakes() (38-60).
//
// The running witness reaches the ordinary sighted, non-hallucinating arm.
// This test keeps that arm's source shape visible while isolating its four
// observable responsibilities: rn1(5, 2), the stream message, MM_NOMSG
// moccasin creation at the hero's square, and the common dryup tail.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { FOUNTAIN, G_GONE, MM_NOMSG, ROOM } from '../js/const.js';
import { drinkfountain } from '../js/fountain.js';
import { game } from '../js/gstate.js';
import { PM_WATER_MOCCASIN } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';

const RC = [
    'OPTIONS=name:SnakeTest,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    '',
].join('\n');

async function startedGame() {
    await runSegment({
        seed: 7712200,
        datetime: '20260801031500',
        nethackrc: RC,
        moves: '',
    });
    return game;
}

test('dowatersnakes follows fountain.c for the ordinary visible arm',
    async () => {
        const source = await readFile(
            new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
            'utf8',
        );
        assert.match(source, /int num = rn1\(5, 2\);/u);
        assert.match(
            source,
            /makemon\(&mons\[PM_WATER_MOCCASIN\], u\.ux, u\.uy,\s+MM_NOMSG\)/u,
        );

        await startedGame();
        const location = game.level.at(game.u.ux, game.u.uy);
        location.typ = FOUNTAIN;
        location.horizontal = 0;
        location.flags = 0;

        const messages = [];
        const creations = [];
        const random = {
            rnd(bound) {
                assert.equal(bound, 30);
                return 22;
            },
            rn1(bound, base) {
                assert.equal(bound, 5);
                assert.equal(base, 2);
                return 4;
            },
            rn2(bound) {
                assert.equal(bound, 3);
                return 0;
            },
        };
        const makeMonster = async (species, x, y, flags) => {
            creations.push({ species, x, y, flags });
            return {
                data: species,
                mx: x + 1,
                my: y,
            };
        };

        await drinkfountain(game, { message: (line) => messages.push(line),
            makeMonster, random });

        assert.deepEqual(messages, [
            'An endless stream of snakes pours forth!',
            'The fountain dries up!',
        ]);
        assert.equal(creations.length, 4);
        for (const creation of creations) {
            assert.equal(creation.species, game.mons[PM_WATER_MOCCASIN]);
            assert.deepEqual([creation.x, creation.y], [game.u.ux, game.u.uy]);
            assert.equal(creation.flags, MM_NOMSG);
        }
        assert.equal(location.typ, ROOM);
    });

test('dowatersnakes leaves unsupported visibility/extinction arms fail-closed',
    async () => {
        await startedGame();
        const location = game.level.at(game.u.ux, game.u.uy);
        location.typ = FOUNTAIN;
        location.horizontal = 0;
        location.flags = 0;
        game.mvitals[PM_WATER_MOCCASIN].mvflags |= G_GONE;

        await assert.rejects(
            () => drinkfountain(game, {
                random: { rnd: () => 22, rn1: () => 4, rn2: () => 1 },
                message: () => {},
            }),
            /extinct water-snake fountain effect/u,
        );
    });
