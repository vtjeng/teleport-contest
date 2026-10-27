import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { D_CLOSED, D_ISOPEN, D_LOCKED, DOOR, SDOOR } from '../js/const.js';
import { engr_at } from '../js/engrave.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { mklev } from '../js/mklev.js';
import { getRngLog } from '../js/rng.js';

const C_RM = readFileSync('nethack-c/upstream/include/rm.h', 'utf8');
const C_SPLEV = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');

async function buildShop(doorState, overwrite) {
    await runSegment({
        seed: 901747,
        datetime: '20320405060710',
        nethackrc: 'OPTIONS=name:DoorAudit,role:Tourist,race:human,gender:female,align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '',
    });

    let beforeStock;
    await mklev({
        specialLevelLoader: async (des) => {
            des.level_init({ style: 'solidfill', fg: ' ', lit: 1 });
            await des.room({
                type: 'ordinary', x: 3, y: 2, xalign: 'center', yalign: 'top',
                w: 11, h: 9, lit: 1,
                contents: () => des.room({
                    type: 'shop', x: 4, y: 3, w: 3, h: 3, lit: 1,
                    contents(room) {
                        des.door({ state: doorState, wall: 'east', pos: 1 });
                        const { x2, y1 } = room.region;
                        const x = x2 + 1;
                        const y = y1 + 1;
                        if (overwrite) des.terrain(room.width, 1, 'S');
                        const loc = game.level.at(x, y);
                        beforeStock = {
                            x, y, typ: loc.typ,
                            flags: loc.flags, doormask: loc.doormask,
                        };
                    },
                }),
            });
        },
    });

    const shop = game.subrooms[0];
    const door = game.level.doors[shop.fdoor];
    const location = game.level.at(door.x, door.y);
    const notice = engr_at(door.x + 1, door.y, game);
    return {
        beforeStock,
        door,
        location: { typ: location.typ, flags: location.flags,
            doormask: location.doormask },
        shopkeeper: shop.resident,
        notice: notice?.engr_txt[0] ?? null,
        rng: getRngLog(),
    };
}

test('special-level secret-door overwrite updates the C door mask before shop stocking',
    async () => {
        assert.match(C_RM, /#define doormask\s+flags/u);
        assert.match(C_SPLEV, /sel_set_ter\(coordxy x, coordxy y, genericptr_t arg\)[\s\S]*?levl\[x\]\[y\]\.doormask = D_CLOSED;/u);

        const overwritten = await buildShop('locked', true);
        assert.deepEqual(overwritten.door, { x: 42, y: 9 });
        assert.deepEqual(overwritten.beforeStock, {
            x: 42, y: 9, typ: SDOOR,
            flags: D_CLOSED, doormask: D_CLOSED,
        });
        assert.deepEqual(overwritten.location, {
            typ: DOOR, flags: D_CLOSED, doormask: D_CLOSED,
        });
        assert.deepEqual(
            [overwritten.shopkeeper?.mx, overwritten.shopkeeper?.my],
            [41, 9],
        );
        assert.equal(overwritten.notice, null);

        const locked = await buildShop('locked', false);
        assert.deepEqual(locked.beforeStock, {
            x: 42, y: 9, typ: DOOR,
            flags: D_LOCKED, doormask: D_LOCKED,
        });
        assert.equal(locked.notice, 'Closed for inventory');
        assert.deepEqual(overwritten.rng, locked.rng,
            'painting a known terrain type must not add random draws');

        for (const [doorState, expectedMask] of [
            ['closed', D_CLOSED], ['open', D_ISOPEN],
        ]) {
            const control = await buildShop(doorState, false);
            assert.equal(control.beforeStock.flags, expectedMask);
            assert.equal(control.beforeStock.doormask, expectedMask);
            assert.equal(control.notice, null);
        }
    });
