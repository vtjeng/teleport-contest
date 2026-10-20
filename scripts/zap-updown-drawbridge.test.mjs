import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { DB_NORTH, DOOR, DRAWBRIDGE_DOWN, MOAT, OROOM } from '../js/const.js';
import { create_drawbridge } from '../js/dbridge.js';
import { game } from '../js/gstate.js';
import { addinv } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { mksobj } from '../js/obj.js';
import { WAN_STRIKING } from '../js/objects.js';
import { zap_updown } from '../js/zap.js';

const C_ZAP = readFileSync(
    new URL('../nethack-c/upstream/src/zap.c', import.meta.url), 'utf8',
);

test('downward striking destroys the lowered drawbridge under the hero',
    async () => {
        assert.match(C_ZAP,
            /zap_updown\(struct obj \*obj\)[\s\S]*?case WAN_STRIKING:[\s\S]*?find_drawbridge\(&xx, &yy\)[\s\S]*?destroy_drawbridge\(xx, yy\)/u);
        await runSegment({
            seed: 672301,
            datetime: '20351018120000',
            nethackrc: 'OPTIONS=name:BridgeZap,role:Wizard,race:human,'
                + 'gender:male,align:neutral,!legacy,!tutorial,'
                + '!splash_screen,pettype:none,!autopickup',
            moves: '',
        });
        let target = null;
        for (const room of game.level.rooms) {
            if (room?.rtype !== OROOM) continue;
            const x = room.lx + 1;
            const y = room.ly;
            if (create_drawbridge(x, y, DB_NORTH, true, game)) {
                target = { x, y };
                break;
            }
        }
        assert.ok(target);
        const bridge = game.level.at(target.x, target.y);
        const wall = game.level.at(target.x, target.y - 1);
        assert.equal(bridge.typ, DRAWBRIDGE_DOWN);
        game.u.ux = target.x;
        game.u.uy = target.y;
        game.u.dz = 1;
        game.nhDisplay.onEmptyQueue = () => 32;
        const wand = mksobj(WAN_STRIKING, false, false, { state: game });
        addinv(wand, { state: game });

        await zap_updown(wand, game);
        assert.equal(bridge.typ, MOAT);
        assert.equal(wall.typ, DOOR);
        assert.equal(game.program_state.gameover, true);
        assert.ok(!game.unported.has('dbridge.c destroy_drawbridge'));
    });
