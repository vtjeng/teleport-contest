// vault.c wallify_vault() 666-674: before a damaged vault wall is restored,
// a monster standing on it is moved away with rloc(), and a tame one first
// yelps (sounds.c yelp()). This pins the C order on a constructed state (an
// opened doorway in the wall); recordings/vault.c/
// wallify_vault-tame-xorn-eating-on-gold-wall-{snarls,deaf-bluffs} reach the
// same lines in play, with the pet on a gold-covered corner.
//
// Expected values come from reading vault.c and sounds.c, not from recording
// JavaScript output.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DOOR, VAULT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { PM_GUARD, PM_LITTLE_DOG } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { gd_move, newegd } from '../js/vault.js';

// The seed, date and options of scripts/vault-guard-escort.test.mjs: any
// started game works, since the test builds the vault and its occupants.
async function startedGame() {
    await runSegment({
        seed: 990700,
        datetime: '20260724120000',
        nethackrc: [
            'OPTIONS=name:VaultTest,role:Healer,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=pettype:none,!autopickup,!debug_mongen,symset:DECgraphics',
            '',
        ].join('\n'),
        moves: ' ',
    });
    game._pending_message = '';
    game.nhDisplay.toplines = '';
    game.nhDisplay.toplin = 0;
}

function addMonster(fields, x, y) {
    const monster = newMonster({
        mhp: 12, mhpmax: 12, mcanmove: 1, mcansee: 1, ...fields,
    });
    monster.nmon = game.level.monlist;
    game.level.monlist = monster;
    place_monster(monster, x, y, game);
    return monster;
}

// A guard whose escort is done (gddone): gd_move() goes straight to
// gd_move_cleanup(), which parks the guard and calls wallify_vault().
function doneGuard(vroom) {
    const room = game.level.rooms[vroom];
    // Two columns right of the room's east wall: outside the vault.
    const grd = addMonster({
        isgd: true, mpeaceful: 1, m_id: 900, mextra: {},
        data: game.mons[PM_GUARD],
    }, room.hx + 3, room.ly);
    newegd(grd);
    const egrd = grd.mextra.egd;
    egrd.gdlevel = { ...game.u.uz };
    egrd.vroom = vroom;
    egrd.gddone = 1;
    egrd.fcbeg = 0;
    egrd.fcend = 0;
    return grd;
}

test('wallify_vault makes a tame monster on a broken vault wall yelp', async () => {
    await startedGame();
    const vroom = 0;
    const room = game.level.rooms[vroom];
    room.rtype = VAULT;
    // The west wall square beside the room's top row, opened as a dug
    // doorway; IS_WALL() is false there, so wallify_vault() repairs it.
    const wx = room.lx - 1;
    const wy = room.ly;
    game.level.at(wx, wy).typ = DOOR;
    // mtame 10 is a starting pet's tameness; MS_BARK gives the "yelp" verb
    // (sounds.c 444-448).
    const dog = addMonster({
        mtame: 10, data: game.mons[PM_LITTLE_DOG],
        mextra: { edog: { abuse: 0 } },
    }, wx, wy);
    const grd = doneGuard(vroom);
    const messages = [];

    await gd_move(grd, {
        state: game,
        message: async (text) => { messages.push(text); },
    });

    const shown = `${game.nhDisplay.toplines ?? ''} ${messages.join(' ')}`;
    // The hero cannot see the vault wall, so Monnam() names the dog "It".
    assert.match(shown, /\bIt yelps!/u);
    assert.notDeepEqual([dog.mx, dog.my], [wx, wy], 'dog was moved off');
    assert.notEqual(game.level.at(wx, wy).typ, DOOR, 'wall was restored');
});
