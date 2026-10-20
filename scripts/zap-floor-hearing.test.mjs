import assert from 'node:assert/strict';
import test from 'node:test';

import { D_BROKEN, D_CLOSED, D_NODOOR, DOOR, ICE, LAVAWALL, POOL } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { zap_over_floor } from '../js/zap.js';

// zap.c:5245-5253: an unseen cold bolt makes a soft crackling sound when
// lava briefly freezes. You_hear handles the acoustics option.
test('unseen brief lava freeze respects acoustics', async () => {
    for (const acoustics of [true, false]) {
        await runSegment({
            seed: 93171023,
            datetime: '20781112121000',
            nethackrc: 'OPTIONS=name:ColdSound,role:Wizard,race:human,gender:female,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
            moves: '',
        });
        game.flags.acoustics = acoustics;
        const x = game.u.ux < 70 ? game.u.ux + 2 : game.u.ux - 2;
        const y = game.u.uy;
        game.level.at(x, y).typ = LAVAWALL;
        game.viz_array[y][x] = 0;
        const messages = [];
        const rangemod = await zap_over_floor(
            x, y, 2, { value: false }, true, 0,
            game, { rn2: () => 1, rnd: () => 1 },
            { message: async (line) => messages.push(line) },
        );
        assert.equal(rangemod, -1000);
        assert.deepEqual(messages, acoustics ? ['You hear a soft crackling.'] : []);
    }
});

// zap.c:5422-5480 sends an unseen door's cold, death-breath, and lightning
// destruction sounds through You_hear1. The door still absorbs the ray.
test('unseen door destruction sounds respect acoustics', async () => {
    for (const [type, sound, doorMask] of [
        [2, 'a deep cracking sound.', D_NODOOR],
        [24, 'crashing wood.', D_NODOOR],
        [5, 'crackling.', D_BROKEN],
    ]) for (const acoustics of [true, false]) {
        await runSegment({
            seed: 93171025,
            datetime: '20781112121000',
            nethackrc: 'OPTIONS=name:DoorSound,role:Wizard,race:human,gender:female,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
            moves: '',
        });
        game.flags.acoustics = acoustics;
        const x = game.u.ux < 70 ? game.u.ux + 2 : game.u.ux - 2;
        const y = game.u.uy;
        const door = game.level.at(x, y);
        door.typ = DOOR;
        door.flags = D_CLOSED;
        door.doormask = D_CLOSED;
        game.viz_array[y][x] = 0;
        const messages = [];
        const rangemod = await zap_over_floor(
            x, y, type, { value: false }, true, 0,
            game, { rn2: () => 0, rnd: () => 1 },
            { message: async (line) => messages.push(line) },
        );
        assert.equal(rangemod, -1000);
        assert.equal(door.doormask, doorMask);
        assert.deepEqual(messages, acoustics ? [`You hear ${sound}`] : []);
    }
});

// zap.c:5291: the distant sound of a pool freezing also goes through
// You_hear, after the tile becomes ice and its melt timer is started.
test('unseen pool freeze respects acoustics', async () => {
    for (const acoustics of [true, false]) {
        await runSegment({
            seed: 93171024,
            datetime: '20781112121000',
            nethackrc: 'OPTIONS=name:PoolSound,role:Wizard,race:human,gender:female,align:neutral\n'
                + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!autopickup\n',
            moves: '',
        });
        game.flags.acoustics = acoustics;
        const x = game.u.ux < 70 ? game.u.ux + 2 : game.u.ux - 2;
        const y = game.u.uy;
        game.level.at(x, y).typ = POOL;
        game.viz_array[y][x] = 0;
        const messages = [];
        const rangemod = await zap_over_floor(
            x, y, 2, { value: false }, true, 0,
            game, { rn2: () => 0, rnd: () => 1 },
            { message: async (line) => messages.push(line) },
        );
        assert.equal(rangemod, -3);
        assert.equal(game.level.at(x, y).typ, ICE);
        assert.deepEqual(messages, acoustics ? ['You hear a crackling sound.'] : []);
    }
});
