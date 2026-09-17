import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import {
    CLOUD,
    DUST,
    ICE,
    ICED_POOL,
    ROOM,
    SET_LIT_RANDOM,
    STONE,
} from '../js/const.js';
import { engr_at } from '../js/engrave.js';
import { game, resetGame } from '../js/gstate.js';
import { lspo_terrain, mklev, splev_chr2typ } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import { initRng } from '../js/rng.js';
import {
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';
import { timeout_globals_init } from '../js/timeout.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');

// The special-level API's terrain() writer is js/mklev.js sel_set_ter(),
// reached only through createSpecialLevelApi(), so each case runs mklev()
// with an injected loader the way makelevel() runs a des-file. The loader
// throws this sentinel after its paint so that finish() never runs; the paint
// is the only result under test.
class LoaderDone extends Error {}

async function paintThroughLoader(seed, paint) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    initRng(seed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'TerrainTest';
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
    let painted = null;
    await assert.rejects(
        mklev({
            specialLevelLoader: async (des) => {
                painted = await paint(des);
                throw new LoaderDone();
            },
        }),
        (error) => error instanceof LoaderDone,
    );
    return painted;
}

// C ref: sp_lev.c sel_set_ter(). The header this port cites must name a
// function whose body holds the door/HWALL fix-up and the two arms the port
// stops on, which mkmaze.c set_levltyp_lit() alone does not.
test('sel_set_ter is the C function with the door, wall, ice and cloud arms', () => {
    const start = C_SOURCE.indexOf('\nsel_set_ter(coordxy x, coordxy y, genericptr_t arg)');
    assert.ok(start > 0);
    const body = C_SOURCE.slice(start, C_SOURCE.indexOf('\n}\n', start));
    assert.match(body, /set_levltyp_lit\(x, y, terr\.ter, terr\.tlit\)/);
    assert.match(body, /levl\[x\]\[y\]\.typ == SDOOR \|\| IS_DOOR\(levl\[x\]\[y\]\.typ\)/);
    assert.match(body, /levl\[x\]\[y\]\.typ == HWALL \|\| levl\[x\]\[y\]\.typ == IRONBARS/);
    assert.match(body, /splev_init_present && levl\[x\]\[y\]\.typ == ICE/);
    assert.match(body, /levl\[x\]\[y\]\.typ == CLOUD\) \{\n\s+del_engr_at\(x, y\);/);
});

// A plain floor paint is the control: the same loader, coordinates and frame
// reach set_levltyp() and leave ROOM behind, so the terrain callback's result
// is observed through the production special-level API.
test('the special-level terrain writer paints an ordinary floor square', async () => {
    // Any seed serves: the loader replaces the whole level's generation.
    const painted = await paintThroughLoader(0x5e1, (des) => {
        // (7, 4) is an arbitrary interior square; the frame offsets it to
        // map coordinates, so the loader reads the frame back rather than
        // assuming xstart = 1 and ystart = 0.
        const x = des.frame.xstart + 7;
        const y = des.frame.ystart + 4;
        assert.equal(game.level.at(x, y).typ, STONE);
        des.terrain(7, 4, '.');
        return { x, y };
    });
    assert.equal(game.level.at(painted.x, painted.y).typ, ROOM);
});

// C ref: sp_lev.c sel_set_ter()'s `ICE` arm sets icedpool from the coder's
// icedpools flag and its `CLOUD` arm calls del_engr_at() after the terrain
// write. Both arms use the active special-level frame.
test('the special-level terrain writer paints ice and clears cloud engravings', async () => {
    assert.equal(splev_chr2typ('I'), ICE);
    assert.equal(splev_chr2typ('C'), CLOUD);
    for (const character of ['C', 'I']) {
        const painted = await paintThroughLoader(0x5e2, (des) => {
            const x = des.frame.xstart + 7;
            const y = des.frame.ystart + 4;
            // A dust engraving on the target square; C's cloud arm is the
            // one that would delete it.
            game.head_engr = {
                engr_x: x,
                engr_y: y,
                engr_txt: ['ad aerarium', 'ad aerarium', 'ad aerarium'],
                engr_type: DUST,
                engr_time: 0,
                nxt_engr: null,
            };
            des.level_init({ style: 'solidfill', fg: ' ', lit: 0 });
            des.level_flags('icedpools');
            des.terrain(7, 4, character);
            return { x, y };
        });
        const location = game.level.at(painted.x, painted.y);
        assert.equal(location.typ, character === 'I' ? ICE : CLOUD, character);
        if (character === 'I') {
            assert.equal(location.icedpool, ICED_POOL, character);
            assert.ok(engr_at(painted.x, painted.y, game), character);
        } else {
            assert.equal(location.icedpool ?? 0, 0, character);
            assert.equal(engr_at(painted.x, painted.y, game), null, character);
        }
    }
});

test('sel_set_ter delegates random lighting once to set_levltyp_lit', async () => {
    const draws = [];
    const painted = await paintThroughLoader(0x5e3, (des) => {
        const x = des.frame.xstart + 7;
        const y = des.frame.ystart + 4;
        lspo_terrain([
            { x: 7, y: 4, typ: '.', lit: SET_LIT_RANDOM },
        ], {
            state: game,
            coder: { croom: null },
            frame: des.frame,
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return 1;
                },
            },
        });
        return { x, y };
    });
    assert.deepEqual(draws, [2]);
    assert.equal(game.level.at(painted.x, painted.y).typ, ROOM);
    assert.equal(game.level.at(painted.x, painted.y).lit, true);
});
