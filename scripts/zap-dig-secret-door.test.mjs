import assert from 'node:assert/strict';
import test from 'node:test';

import { D_CLOSED, D_NODOOR, DOOR, ROOM, SDOOR } from '../js/const.js';
import { zap_dig } from '../js/dig.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';

// C ref: dig.c zap_dig() (1669-1681). A digging beam that reaches a secret
// door sets only `room->typ = DOOR` and then `doormask = D_NODOOR`; unlike
// detect.c cvt_sdoor_to_door(), it leaves the arboreal_sdoor bit, which rm.h
// aliases to candig, as it was.
test('zap_dig turns a secret door into a doorway without clearing candig', async () => {
    // Any seed and character reach a level; this Wizard starts on D:1 and no
    // key is replayed, so the squares below are built by hand.
    await runSegment({ seed: 2026111901, datetime: '20261119103000',
        nethackrc: 'OPTIONS=name:Sdoor,role:Wizard,race:human,gender:female,'
            + 'align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: '' });
    const { u } = game;
    // A 4x3 patch of floor around <10,10>, away from D:1's map edge, with
    // the hero zapping east (dx 1) at the secret door on <11,10>.
    for (let x = 9; x <= 12; x++) for (let y = 9; y <= 11; y++) {
        const loc = game.level.at(x, y);
        loc.typ = ROOM;
        loc.flags = 0;
    }
    u.ux = 10; u.uy = 10;
    u.dx = 1; u.dy = 0; u.dz = 0;
    const door = game.level.at(11, 10);
    door.typ = SDOOR;
    // D_CLOSED is the mask a secret door carries; cvt_sdoor_to_door() would
    // keep it before zap_dig() overwrites it with D_NODOOR.
    door.flags = D_CLOSED;
    // The arboreal_sdoor bit, set on a garden theme room's secret door.
    door.candig = true;

    // rn1(18, 8) is the beam's dig depth; 8 is its lowest value, enough for
    // the door (cost 2) and the floor behind it.
    await zap_dig(game, { rn1: () => 8 });

    assert.equal(door.typ, DOOR);
    assert.equal(door.flags, D_NODOOR);
    assert.equal(door.candig, true, 'zap_dig() does not clear arboreal_sdoor');
});
