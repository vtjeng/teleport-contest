import assert from 'node:assert/strict';
import test from 'node:test';

import { ECMD_TIME, IN_SIGHT, ROOM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { can_center_cloud, seffects } from '../js/read.js';
import { spelleffects } from '../js/spell.js';
import {
    SCR_SCARE_MONSTER, SCR_TAMING, SCROLL_CLASS,
    SPE_CAUSE_FEAR, SPE_CHARM_MONSTER,
} from '../js/objects.js';

async function emptyTamingWorld(seed) {
    await runSegment({
        seed,
        datetime: '20310908070605',
        nethackrc: [
            'OPTIONS=name:Tamer,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '.',
    });

    // read.c:seffect_taming() scans the adjacent square ring, plus the steed
    // fallback under the hero. Empty it so this test pins its no-target arm.
    const grid = game.level.monsters;
    for (let x = 0; x < grid.length; ++x)
        for (let y = 0; y < grid[x].length; ++y)
            grid[x][y] = null;
    game.u.uswallow = 0;
    game.u.ustuck = null;
    game.u.usteed = null;
    game.gk = {};
    game._pending_message = '';
}

async function emptyScareWorld(seed) {
    await emptyTamingWorld(seed);
    for (let monster = game.level?.monlist ?? game.fmon;
        monster; monster = monster.nmon)
        monster.mhp = 0;
    if (game.level) game.level.monlist = null;
    game.fmon = null;
}

function scareScroll(otyp = SCR_SCARE_MONSTER, cursed = false) {
    return {
        otyp,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed,
        quan: 1,
    };
}

test('read.c seffect_taming handles an empty nearby-monster scan', async () => {
    await emptyTamingWorld(8080051);
    await seffects({
        otyp: SCR_TAMING,
        oclass: SCROLL_CLASS,
        blessed: false,
        cursed: false,
        quan: 1,
    }, game);

    assert.equal(game._pending_message, 'Nothing interesting happens.');
    assert.equal(game.gk.known, undefined);
});

test('read.c can_center_cloud pins valid terrain, sight, and distu boundary', async () => {
    await runSegment({
        seed: 8080053,
        datetime: '20310908070606',
        nethackrc: [
            'OPTIONS=name:Firetest,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none',
            '',
        ].join('\n'),
        moves: '.',
    });

    const { ux, uy } = game.u;
    const markVisibleRoom = (x, y) => {
        game.level.at(x, y).typ = ROOM;
        game.viz_array[y][x] |= IN_SIGHT;
    };
    markVisibleRoom(ux, uy);
    markVisibleRoom(ux + 3, uy + 3);
    markVisibleRoom(ux + 4, uy + 4);
    markVisibleRoom(ux + 1, uy);
    game.viz_array[uy][ux + 1] &= ~IN_SIGHT;

    // read.c:1080-1085 calls valid_cloud_pos first, then cansee(), then
    // distu() < 32; hack.h:1531 defines distu as the squared distance.
    assert.equal(can_center_cloud(ux, uy, game), true);
    assert.equal(can_center_cloud(ux + 3, uy + 3, game), true);
    assert.equal(can_center_cloud(ux + 4, uy + 4, game), false);
    assert.equal(can_center_cloud(ux + 1, uy, game), false);
    assert.equal(can_center_cloud(0, uy, game), false);
});

test('spell.c charm monster dispatches through read.c seffects', async () => {
    await emptyTamingWorld(8080052);
    const result = await spelleffects(
        SPE_CHARM_MONSTER,
        false,
        true,
        game,
    );

    assert.equal(result, ECMD_TIME);
    assert.equal(game._pending_message, 'Nothing interesting happens.');
});

test('read.c scare scroll reports distant laughter when no monster is visible', async () => {
    await emptyScareWorld(8080055);
    await seffects(scareScroll(), game);

    assert.equal(
        game._pending_message,
        'You hear maniacal laughter in the distance.',
    );
});

test('read.c scare scroll uses the cursed sad-wailing branch', async () => {
    await emptyScareWorld(8080056);
    await seffects(scareScroll(SCR_SCARE_MONSTER, true), game);

    assert.equal(
        game._pending_message,
        'You hear sad wailing in the distance.',
    );
});

test('spell.c cause fear dispatches through read.c seffects', async () => {
    await emptyScareWorld(8080057);
    const result = await spelleffects(
        SPE_CAUSE_FEAR,
        false,
        true,
        game,
    );

    assert.equal(result, ECMD_TIME);
    assert.equal(
        game._pending_message,
        'You hear maniacal laughter in the distance.',
    );
});
