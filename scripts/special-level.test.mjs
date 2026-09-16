import assert from 'node:assert/strict';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import { game, resetGame } from '../js/gstate.js';
import { mklev } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import { initRng } from '../js/rng.js';
import { light_globals_init } from '../js/light.js';
import {
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';
import { timeout_globals_init } from '../js/timeout.js';

class LoaderDone extends Error {}

async function runLoader(body) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    light_globals_init(game);
    initRng(0x5eed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'SpecialLevelTest';
    game.flags = {
        initrole: str2role('Tourist'),
        initrace: str2race('human'),
        initgend: str2gend('female'),
        initalign: str2align('neutral'),
        female: true,
        bones: false,
    };
    game.iflags = {};
    game.u = { uroleplay: {} };
    game.context = { move: 0 };
    await newgame_pre_mklev(game);

    await assert.rejects(
        mklev({
            specialLevelLoader: async (des) => {
                await body(des);
                throw new LoaderDone();
            },
        }),
        (error) => error instanceof LoaderDone,
    );
}

test('special-level API waits for map, room, and region contents callbacks',
    async () => {
        const events = [];
        await runLoader(async (des) => {
            const delayed = () => Promise.resolve().then(() => {});

            const mapResult = des.map({
                map: '...\n...\n...',
                halign: 'center',
                valign: 'center',
                async contents() {
                    events.push('map:start');
                    await delayed();
                    events.push('map:end');
                },
            });
            assert.equal(typeof mapResult.then, 'function');
            assert.equal(des.frame.xsize, 3);
            await mapResult;
            events.push('map:return');

            const roomResult = des.room({
                type: 'ordinary',
                x: 1,
                y: 1,
                w: 3,
                h: 3,
                async contents() {
                    events.push('room:start');
                    await delayed();
                    events.push('room:end');
                },
            });
            assert.equal(typeof roomResult.then, 'function');
            await roomResult;
            events.push('room:return');

            const regionResult = des.region({
                region: [8, 1, 10, 3],
                type: 'ordinary',
                irregular: true,
                async contents() {
                    events.push('region:start');
                    await delayed();
                    events.push('region:end');
                },
            });
            assert.equal(typeof regionResult.then, 'function');
            await regionResult;
            events.push('region:return');
        });

        assert.deepEqual(events, [
            'map:start', 'map:end', 'map:return',
            'room:start', 'room:end', 'room:return',
            'region:start', 'region:end', 'region:return',
        ]);
    });
