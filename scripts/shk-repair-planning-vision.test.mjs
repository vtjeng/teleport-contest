// shk.c repair_damage() restores a damaged shop wall and calls block_point()
// on it (shk.c:4815-4816). The once-per-turn planning pass runs shk_move()
// on a cloned state but borrows vision.c's module-wide transparency index,
// so a planned repair must mark that borrow before block_point(); the
// preflight wrapper then restores the index. Without the mark, the dry run
// closed the wall on the live map, and a pet that moved before the live
// shopkeeper lost sight of a target through the hole (batch-6 game g01695:
// C's score_targ() drew rnd(5), the port found no target).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { GameMap } from '../js/game.js';
import { HWALL, REPAIR_DELAY, ROOM, ROOMOFFSET, SHOPBASE } from '../js/const.js';
import { fix_shop_damage } from '../js/shk.js';
import { PM_SHOPKEEPER } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { light_globals_init } from '../js/light.js';
import {
    clear_path,
    init_vision_globals,
    transparencyIndexViews,
    vision_recalc,
    vision_reset,
} from '../js/vision.js';
import {
    admitPlannedVisionChange,
    planningState,
    preflightElapsedTurnTail,
} from '../js/unported_monster_actions.js';

const SHK_C_SOURCE = readFileSync('nethack-c/upstream/src/shk.c', 'utf8');
const index = () => transparencyIndexViews().map((row) => Array.from(row));

// A 14x9 lit shop floor (x 3..16, y 3..11) owned by one shopkeeper. Its
// column x=10 is the damaged wall square at y=7: before the repair the hero
// at (10,4) sees straight down through it to (10,10).
const WALL = { x: 10, y: 7 };
async function setup() {
    // Any start works; the level is replaced below. Seed and date are
    // arbitrary values not taken from a recorded session.
    await runSegment({
        seed: 6150923,
        datetime: '20310214101500',
        nethackrc: 'OPTIONS=name:Mason,role:Healer,race:human,gender:female,'
            + 'align:neutral,pettype:none,!legacy,!tutorial,!splash_screen\n',
        moves: ' ',
    });
    game.level = new GameMap();
    for (let x = 3; x <= 16; x++) {
        for (let y = 3; y <= 11; y++) {
            const location = game.level.at(x, y);
            location.typ = ROOM;
            location.lit = true;
            location.roomno = ROOMOFFSET;
        }
    }
    game.level.rooms[0] = { rtype: SHOPBASE, resident: null };
    game.level.nroom = 1;
    game.level.monlist = null;
    const shkp = newMonster({
        data: game.mons[PM_SHOPKEEPER],
        mnum: PM_SHOPKEEPER,
        isshk: true,
        mpeaceful: true,
        mcanmove: true,
        mcansee: true,
        mhp: 20,
        mhpmax: 20,
        mextra: {
            eshk: {
                shoproom: ROOMOFFSET,
                shk: { x: 14, y: 9 },
                shoplevel: { ...game.u.uz },
                following: false,
                robbed: 0,
                billct: 0,
                debit: 0,
                surcharge: false,
            },
        },
    });
    place_monster(shkp, 14, 9, game);
    game.level.monlist = shkp;
    game.level.rooms[0].resident = shkp;
    game.u.ux = 10;
    game.u.uy = 4;
    game.moves = REPAIR_DELAY + 1;
    // The repaired square was a horizontal shop wall; the record is old
    // enough (REPAIR_DELAY elapsed) for shk.c repairable_damage().
    game.level.damagelist = {
        when: 1,
        place: { ...WALL },
        cost: 0,
        typ: HWALL,
        flags: 0,
        next: null,
    };
    light_globals_init(game);
    init_vision_globals();
    vision_reset(game);
    vision_recalc(0);
}

test('C repair_damage() blocks the repaired square for vision', () => {
    const start = SHK_C_SOURCE.indexOf('\nrepair_damage(');
    assert.ok(start >= 0, 'C repair_damage definition is present');
    const body = SHK_C_SOURCE.slice(start, SHK_C_SOURCE.indexOf('\n}\n', start));
    assert.match(body, /block_point\(x, y\);/u);
});

test('a planned shop repair leaves the live transparency index alone', async () => {
    await setup();
    const before = index();
    assert.equal(clear_path(10, 4, 10, 10), 1);
    let repairedInPlan = false;
    await preflightElapsedTurnTail(game, async (planned) => {
        await fix_shop_damage(planned, {
            planning: true,
            admitPlannedVisionChange,
        });
        repairedInPlan = planned.level.at(WALL.x, WALL.y).typ === HWALL;
        // Inside the plan the borrowed index sees the repaired wall.
        assert.equal(clear_path(10, 4, 10, 10), 0);
        return true;
    });
    assert.equal(repairedInPlan, true);
    assert.equal(game.level.at(WALL.x, WALL.y).typ, ROOM);
    assert.deepEqual(index(), before);
    assert.equal(clear_path(10, 4, 10, 10), 1);
});

test('a planned shop repair without the index owner is refused', async () => {
    await setup();
    const before = index();
    const planned = planningState(game);
    await assert.rejects(
        () => fix_shop_damage(planned, { planning: true }),
        /admitPlannedVisionChange/u,
    );
    assert.deepEqual(index(), before);
});
