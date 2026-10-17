import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BLINDED,
    DETECT_MONSTERS,
    IN_SIGHT,
    SEE_INVIS,
    TELEPAT,
} from '../js/const.js';
import {
    docrt,
    knowninvisible,
    see_nearby_objects,
    status_eval_next_unhilite,
    timebot,
} from '../js/display.js';
import { GameMap } from '../js/game.js';
import { init_objects } from '../js/o_init.js';
import { game, resetGame } from '../js/gstate.js';
import { POT_HEALING, POTION_CLASS } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import { GLYPH_OBJ_OFF } from '../js/glyph_offsets.js';
import { STATUS_FIELDS } from '../js/status_field_data.js';

function nearbyObjectState() {
    const state = {
        u: { ux: 10, uy: 10, xray_range: 0, uprops: [] },
        level: new GameMap(),
        viz_array: Array.from({ length: 24 }, () => new Uint8Array(80)),
    };
    init_objects(state, () => 0);
    const object = {
        otyp: POT_HEALING,
        ox: 11,
        oy: 10,
        dknown: false,
    };
    state.level.objects[object.ox][object.oy] = object;
    // C's object-class glyph is generic before close observation.
    state.level.at(object.ox, object.oy).remembered_glyph = {
        glyph: GLYPH_OBJ_OFF + POTION_CLASS,
    };
    // The 11,10 square is one cardinal step from the 10,10 hero; IN_SIGHT
    // makes display.c:see_nearby_objects take its observation arm.
    state.viz_array[object.oy][object.ox] = IN_SIGHT;
    return { state, object };
}

function invisibleState() {
    const state = {
        u: { ux: 10, uy: 10, uprops: [] },
        viz_array: [],
    };
    return state;
}

test('timebot selects BL_TIME in both rule banks without copying prior values',
    async () => {
        const state = resetGame();
        const field = STATUS_FIELDS.find(row => row.key === 'time').fld;
        const size = Math.max(...STATUS_FIELDS.map(row => row.fld)) + 1;
        const bank = () => Array(size).fill(null);
        const firstRule = {
            field: 'time', behavior: 'absolute', relation: '<', value: 11,
            style: { attrib: 2, color: 1 },
        };
        const selectedRule = {
            field: 'time', behavior: 'absolute', relation: '>=', value: 11,
            style: { attrib: 2, color: 2 },
        };
        state.flags = { time: true };
        state.iflags = { hilite_delta: 3, status_hilites: [firstRule, selectedRule] };
        state.moves = 10;
        state._renderedStatusLayouts = [];
        state.disp = { time_botl: true };
        state.gb = {
            status_hilite_rule: [bank(), bank()],
            status_hilite_value: [bank(), bank()],
            status_hilite_compare_value: [bank(), bank()],
            status_hilite_percent: [bank(), bank()],
            status_hilite_text: [bank(), bank()],
            status_hilite_type: [bank(), bank()],
            status_hilite_times: [bank().map(() => 0), bank().map(() => 0)],
            status_hilite_chg: Array(size).fill(false),
        };
        state.gb.status_hilite_value[1][field] = 0;
        state.gb.status_hilite_compare_value[1][field] = 92;
        state.gb.status_hilite_percent[1][field] = 93;
        state.gb.status_hilite_text[1][field] = 'old time text';
        state.gb.status_hilite_type[1][field] = 94;
        state.gb.status_hilite_times[0][field] = 12;
        state.gb.status_hilite_times[1][field] = 95;

        await timebot();

        assert.equal(state.gb.status_hilite_value[0][field], 10);
        assert.equal(state.gb.status_hilite_value[1][field], 0,
            'stat_update_time changes the current raw value without copying it');
        assert.equal(state.gb.status_hilite_rule[0][field], firstRule);
        assert.equal(state.gb.status_hilite_rule[1][field], firstRule);
        assert.equal(state.gb.status_hilite_value[1][field], 0);
        assert.equal(state.gb.status_hilite_compare_value[1][field], 92);
        assert.equal(state.gb.status_hilite_percent[1][field], 93);
        assert.equal(state.gb.status_hilite_text[1][field], 'old time text');
        assert.equal(state.gb.status_hilite_type[1][field], 94);
        assert.equal(state.gb.status_hilite_times[0][field], 12);
        assert.equal(state.gb.status_hilite_times[1][field], 95);
        assert.equal(state.gb.status_hilite_chg_banks[0][field], true);
        assert.equal(state.gb.status_hilite_chg_banks[1][field], true);

        status_eval_next_unhilite(state);
        assert.equal(state.gb.status_hilite_chg_banks[0][field], false);
        assert.equal(state.gb.status_hilite_chg_banks[1][field], false);
        state.moves = 11;
        state.disp.botl = false;
        await timebot();

        assert.equal(state.gb.status_hilite_value[0][field], 11);
        assert.equal(state.gb.status_hilite_value[1][field], 0,
            'the timebot transition preserves the previous raw-value bank');
        assert.equal(state.gb.status_hilite_rule[0][field], selectedRule);
        assert.equal(state.gb.status_hilite_rule[1][field], selectedRule,
            'eval_notify writes a newly selected rule into both banks');
        assert.equal(state.gb.status_hilite_chg_banks[0][field], true);
        assert.equal(state.gb.status_hilite_chg_banks[1][field], true);
    });

test('knowninvisible uses visible see-invisible and monster-detection senses', () => {
    // display.h:_knowninvisible() is pure: it reads minvis, cansee, three
    // properties, and the squared bolt-range distance without changing state.
    const state = invisibleState();
    const monster = { mx: 12, my: 13, minvis: true };
    state.viz_array[13] = [];
    state.viz_array[13][12] = IN_SIGHT;

    state.u.uprops[SEE_INVIS] = { intrinsic: 1, extrinsic: 0 };
    assert.equal(knowninvisible(monster, state), true);
    state.u.uprops[SEE_INVIS] = { intrinsic: 0, extrinsic: 0 };
    state.u.uprops[DETECT_MONSTERS] = { intrinsic: 0, extrinsic: 1 };
    assert.equal(knowninvisible(monster, state), true);
    monster.minvis = false;
    assert.equal(knowninvisible(monster, state), false);
});

test('knowninvisible requires unblinded extrinsic telepathy within bolt range', () => {
    // display.h uses ETelepat (not intrinsic blind telepathy) and mdistu <=
    // BOLT_LIM squared; hack.h defines mdistu() with squared Euclidean range.
    const state = invisibleState();
    const monster = { mx: 16, my: 14, minvis: true };
    state.u.uprops[TELEPAT] = { intrinsic: 0, extrinsic: 1 };
    assert.equal(knowninvisible(monster, state), true);

    monster.mx = 17;
    assert.equal(knowninvisible(monster, state), false);
    monster.mx = 16;
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    assert.equal(knowninvisible(monster, state), false);

    state.u.uprops[TELEPAT] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[BLINDED] = null;
    assert.equal(knowninvisible(monster, state), false);
});

test('planned nearby-object observation mutates only its supplied state', () => {
    const cDisplay = readFileSync(
        new URL('../nethack-c/upstream/src/display.c', import.meta.url),
        'utf8',
    );
    const cOInit = readFileSync(
        new URL('../nethack-c/upstream/src/o_init.c', import.meta.url),
        'utf8',
    );
    const jsDisplay = readFileSync(
        new URL('../js/display.js', import.meta.url),
        'utf8',
    );
    const cStart = cDisplay.indexOf('\nsee_nearby_objects(void)');
    const cEnd = cDisplay.indexOf('\n/*\n * Update hallucinated traps', cStart);
    assert.ok(cStart >= 0 && cEnd > cStart,
        'the complete C nearby-object helper is available');
    assert.match(cDisplay.slice(cStart, cEnd),
        /observe_object\(obj\);[\s\S]*?glyph_is_generic_object\(glyph\)[\s\S]*?newsym_force\(ix, iy\);/u);
    const observeStart = cOInit.indexOf('\nobserve_object(struct obj *obj)');
    const observeEnd = cOInit.indexOf('\nvoid\ndiscover_object', observeStart);
    assert.ok(observeStart >= 0 && observeEnd > observeStart,
        'the complete C object-observation helper is available');
    assert.match(cOInit.slice(observeStart, observeEnd),
        /obj->dknown = 1;\s*discover_object\(oindx, FALSE, TRUE, FALSE\);/u);
    assert.match(jsDisplay,
        /observe_object\(object, state\);[\s\S]*?redrawCell\(ix, iy, state\);/u);
    assert.match(jsDisplay,
        /state !== game && typeof redraw !== 'function'[\s\S]*?newsym\(x, y\)/u);

    const { state, object } = nearbyObjectState();
    // With no explicit redraw owner, a foreign state remains guarded before
    // C's observation writes; only the planning caller can opt into a seam.
    assert.throws(
        () => see_nearby_objects(state),
        /redraws the global game/u,
    );
    const redraws = [];
    see_nearby_objects(state, {
        redraw: (x, y, target) => {
            redraws.push({ x, y, target, dknown: object.dknown,
                encountered: target.objects[POT_HEALING].oc_encountered,
                discovered: target.svd.disco.includes(POT_HEALING) });
        },
    });
    assert.equal(object.dknown, true);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 1);
    assert.ok(state.svd.disco.includes(POT_HEALING));
    assert.deepEqual(redraws, [{
        x: 11,
        y: 10,
        target: state,
        dknown: true,
        encountered: 1,
        discovered: true,
    }]);
    assert.equal(game.objects?.[POT_HEALING]?.oc_encountered, undefined,
        'clone discovery does not write through to the live game');
});

test('docrt redraws the hero through vision while monster overlays are deferred', async () => {
    // An independent Wizard startup initializes the canonical vision buffers.
    // No commands are needed: docrt's source contract is the redraw itself.
    await runSegment({ seed: 136072, datetime: '20971007120000', moves: '',
        nethackrc: 'OPTIONS=name:Redraw,role:Wizard,race:human,gender:male,align:neutral\nOPTIONS=!legacy,!tutorial,!splash_screen,pettype:none\n' });
    clearTtyMessageWindow(game); // Isolate redraw from the startup welcome More.
    const { ux, uy } = game.u;
    const location = game.level.at(ux, uy);
    // Map memory belongs to the underlying floor object, not the hero overlay.
    location.remembered_glyph = { glyph: GLYPH_OBJ_OFF + POT_HEALING };
    game.gd ??= {};
    game.gd.defer_see_monsters = true;
    await docrt();
    assert.equal(location.disp_glyph.ch, '@',
        'display.c docrt_flags restores vision before its deferred see_monsters call');
    assert.equal(game.gd.defer_see_monsters, true,
        'only the allmain.c post-restore consumer clears the deferral');
    assert.equal(game.program_state.in_docrt, false);
    assert.equal(game.disp.botlx, true);
});
