import assert from 'node:assert/strict';
import test from 'node:test';

import { MINV_ALL, OBJ_MINVENT, PICK_NONE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { display_minventory } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import { PM_PURPLE_WORM } from '../js/monsters.js';
import { newObject } from '../js/obj.js';
import { OIL_LAMP } from '../js/objects.js';

async function setup() {
    await runSegment({
        seed: 311,
        datetime: '20431009123456',
        nethackrc: 'OPTIONS=name:SwallowAudit,role:Wizard,race:human,'
            + 'gender:female,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n',
        moves: ' ',
    });
    return newMonster({
        data: game.mons[PM_PURPLE_WORM],
        minvent: null,
        misc_worn_check: 0,
        mw: null,
        mx: game.u.ux,
        my: game.u.uy,
    });
}

test('a swallowing monster lists the hero with an empty monster inventory',
    async () => {
        // C invent.c:5348-5365 keeps have_any true for an engulfing monster,
        // and pickup.c:1151-1171 appends the fake hero row to the menu.
        const monster = await setup();
        game.u.uswallow = 1;
        game.u.ustuck = monster;
        let rows;
        const result = await display_minventory(
            monster, MINV_ALL | PICK_NONE, null, game,
            { menu: (items) => { rows = items; return null; } },
        );
        assert.equal(result, null);
        assert.ok(rows?.some((row) => row.label?.includes('SwallowAudit')));
    });

test('an empty inventory outside engulfment has no hero row', async () => {
    const monster = await setup();
    let rows;
    await display_minventory(
        monster, MINV_ALL | PICK_NONE, null, game,
        { menu: (items) => { rows = items; return null; } },
    );
    assert.ok(rows?.some((row) => row.text === '(none)'));
    assert.equal(rows.some((row) => row.label?.includes('SwallowAudit')),
        false);
});

test('an engulfing monster groups its possessions before the hero row',
    async () => {
        // pickup.c query_objlist():1152-1157 adds the Creatures heading only
        // when sorted monster objects precede the swallowed hero.
        const monster = await setup();
        const lamp = newObject({
            otyp: OIL_LAMP,
            oclass: game.objects[OIL_LAMP].oc_class,
            quan: 1,
            where: OBJ_MINVENT,
            ocarry: monster,
        });
        monster.minvent = lamp;
        game.u.uswallow = 1;
        game.u.ustuck = monster;
        let rows;
        await display_minventory(
            monster, MINV_ALL | PICK_NONE, null, game,
            { menu: (items) => { rows = items; return null; } },
        );
        assert.ok(rows.some((row) => row.value === lamp));
        assert.ok(rows.some((row) => row.text === 'Swallowed Creatures'));
        assert.ok(rows.some((row) => row.label?.includes('SwallowAudit')));
    });
