import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    FIRE_RES,
    FROMOUTSIDE,
    LAST_PROP,
    LEVITATION,
    LAVAPOOL,
    OBJ_INVENT,
    TT_LAVA,
    TT_NONE,
    W_ARMF,
    WWALKING,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { init_objects } from '../js/o_init.js';
import {
    HIGH_BOOTS,
    LEVITATION_BOOTS,
    SPEED_BOOTS,
    WATER_WALKING_BOOTS,
    ARMOR_CLASS,
    objects_globals_init,
} from '../js/objects.js';
import { newObject } from '../js/obj.js';
import { monst_globals_init, PM_HUMAN } from '../js/monsters.js';
import { initRng } from '../js/rng.js';
import { timeout_globals_init } from '../js/timeout.js';
import { HeadlessTerminal } from '../js/terminal.js';
import { Boots_off } from '../js/do_wear.js';
import { lava_effects } from '../js/trap.js';
import { statusConditionActive } from '../js/display.js';

function stateWithLava() {
    const state = resetGame();
    initRng(1234);
    state.dungeons = [{
        depth_start: 1,
        entry_lev: 1,
        num_dunlevs: 10,
        dunlev_ureached: 1,
        flags: {},
    }];
    state.level = new GameMap();
    state.level.at(10, 5).typ = LAVAPOOL;
    state.u = {
        ux: 10,
        uy: 5,
        uz: { dnum: 0, dlevel: 1 },
        uhp: 20,
        uhpmax: 20,
        umonnum: PM_HUMAN,
        umonster: PM_HUMAN,
        uprops: Array.from(
            { length: LAST_PROP + 1 },
            () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
        ),
        utrap: 0,
        utraptype: TT_NONE,
        uinwater: false,
        usteed: null,
    };
    state.context = { ident: 1 };
    state.flags = { verbose: true };
    state.iflags = {};
    state.program_state = { gameover: false };
    state.gw = {};
    state.urole = { mnum: PM_HUMAN };
    state.urace = { mnum: PM_HUMAN };
    monst_globals_init(state);
    objects_globals_init(state);
    init_objects(state, () => 0);
    timeout_globals_init(state);
    state.youmonst = { data: state.mons[PM_HUMAN] };
    state.nhDisplay = new HeadlessTerminal({ cols: 80, rows: 24 });
    state._ttyToplines = '';
    return state;
}

function boot(state, otyp, o_id = 1) {
    const obj = newObject({
        o_id,
        otyp,
        oclass: ARMOR_CLASS,
        where: OBJ_INVENT,
        owornmask: W_ARMF,
        quan: 1,
    });
    state.invent = obj;
    state.uarmf = obj;
    return obj;
}

test('lava source owns the complete damage and Boots_off call order',
    async () => {
        const source = await readFile(
            new URL('../nethack-c/upstream/src/trap.c', import.meta.url),
            'utf8',
        );
        const lava = source.slice(
            source.indexOf('boolean\nlava_effects(void)'),
            source.indexOf('\n/* called each turn when trapped in lava */'),
        );
        assert.match(lava, /const int dmg = d\(6, 6\)/u);
        assert.match(lava, /if \(uarmf && \(uarmf->in_use/u);
        assert.match(lava, /\(void\) Boots_off\(\)/u);
        assert.match(lava, /goto burn_stuff/u);
        assert.match(lava, /destroy_items\(&gy\.youmonst, AD_FIRE, dmg\)/u);
    });

test('water walking boots clear their slot without recursive lava effects',
    async () => {
        const state = stateWithLava();
        const obj = boot(state, WATER_WALKING_BOOTS);
        state.u.uprops[WWALKING].extrinsic = W_ARMF;
        state.iflags.in_lava_effects = 1;

        assert.equal(await Boots_off(state), 0);
        assert.equal(state.uarmf, null);
        assert.equal(obj.owornmask, 0);
        assert.equal(state.u.uprops[WWALKING].extrinsic, 0);
        assert.equal(state.iflags.in_lava_effects, 1);
    });

test('walking on lava applies d6 damage then follows burn_stuff', async () => {
    const state = stateWithLava();
    state.u.uprops[WWALKING].intrinsic = 1;
    const hp = state.u.uhp;

    assert.equal(await lava_effects(state), false);
    assert.equal(state.u.uhp, hp - 17);
    assert.equal(state.u.utraptype, TT_NONE);
    assert.match(state._ttyToplines, /lava here burns you/u);
});

test('fire resistance starts a lava trap and takes one point', async () => {
    const state = stateWithLava();
    state.u.uprops[FIRE_RES].intrinsic = 1;
    const hp = state.u.uhp;

    assert.equal(await lava_effects(state), false);
    assert.equal(state.u.utraptype, TT_LAVA);
    assert.ok(state.u.utrap > 0);
    assert.equal(state.u.uhp, hp - 1);
});

test('lava trap sets the source InLava status condition', async () => {
    const source = await readFile(
        new URL('../nethack-c/upstream/src/botl.c', import.meta.url),
        'utf8',
    );
    assert.match(source, /test_if_enabled\(bl_inlava\) = \(u\.utraptype == TT_LAVA\)/u);
    const state = stateWithLava();
    assert.equal(statusConditionActive('inlava', state.u), false);
    state.u.utrap = 3334;
    state.u.utraptype = TT_LAVA;
    assert.equal(statusConditionActive('inlava', state.u), true);
    state.u.utraptype = TT_NONE;
    assert.equal(statusConditionActive('inlava', state.u), false);
});

test('levitation boots preserve outside blocking in Boots_off', async () => {
    const state = stateWithLava();
    const obj = boot(state, LEVITATION_BOOTS);
    state.u.uprops[LEVITATION].blocked = FROMOUTSIDE;
    assert.equal(await Boots_off(state), 0);
    assert.equal(obj.owornmask, 0);
    assert.equal(state.uarmf, null);
});

test('ordinary speed and high boots reach their source arms', async () => {
    for (const otyp of [SPEED_BOOTS, HIGH_BOOTS]) {
        const state = stateWithLava();
        const obj = boot(state, otyp);
        assert.equal(await Boots_off(state), 0);
        assert.equal(obj.owornmask, 0);
        assert.equal(state.uarmf, null);
    }
});
