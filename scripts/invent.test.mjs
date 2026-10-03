import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compareSessionOutputs } from './diff-fresh.mjs';

import { COLNO, ROOM, ROWNO } from '../js/const.js';
import {
    consume_obj_charge,
    display_binventory,
    only_here,
    sobj_at,
} from '../js/invent.js';
import { DAGGER, DART } from '../js/objects.js';
import { UnsupportedShopError } from '../js/shk.js';
import { runSegment } from '../js/jsmain.js';

const INVENT_C = readFileSync(
    new URL('../nethack-c/upstream/src/invent.c', import.meta.url), 'utf8',
);
const INVENT_JS = readFileSync('js/invent.js', 'utf8');

test('fully_identify_obj learns a known egg species after object flags', () => {
    const cStart = INVENT_C.indexOf('fully_identify_obj(struct obj *otmp)');
    const cEnd = INVENT_C.indexOf('\n}', cStart) + 2;
    const cFunction = INVENT_C.slice(cStart, cEnd);
    const jsStart = INVENT_JS.indexOf('export function fully_identify_obj(');
    const jsEnd = INVENT_JS.indexOf('\n}', jsStart) + 2;
    const jsFunction = INVENT_JS.slice(jsStart, jsEnd);
    assert.ok(cStart >= 0 && cEnd > cStart);
    assert.match(cFunction, /otmp->known = otmp->bknown = otmp->rknown = 1;[\s\S]*if \(otmp->otyp == EGG && otmp->corpsenm != NON_PM\)[\s\S]*learn_egg_type\(otmp->corpsenm\);/u);
    assert.match(jsFunction, /obj\.known = true;[\s\S]*obj\.rknown = true;[\s\S]*if \(obj\.otyp === EGG && obj\.corpsenm !== NON_PM\)[\s\S]*learn_egg_type\(obj\.corpsenm, state\);/u);
});

test('fully_identify_obj matches the admitted egg-species identification route', async () => {
    // The recorded #wizidentify path selects all-identify and reaches this
    // helper with a blessed giant-ant egg; step 69 names the next fresh egg.
    const recording = JSON.parse(readFileSync(
        'challenges/cases/v18/wizard-learns-egg-type-from-identification-c59.session.json',
        'utf8',
    ));
    const segment = recording.segments[0];
    const result = await runSegment(segment);
    const comparison = compareSessionOutputs(recording, {
        rng: result.getRngLog(),
        screens: result.getScreens(),
        cursors: result.getCursors(),
        animFrames: result.getAnimationFramesByStep(),
        segments: [{
            rng: result.getRngLog(),
            screens: result.getScreens(),
            cursors: result.getCursors(),
            animFrames: result.getAnimationFramesByStep(),
        }],
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison, null, 2));
    assert.match(segment.steps[69].screen, /a giant ant egg/u);
});

test('only_here reads C go.only and matches only its target square', () => {
    // The target (5,9) is the C go.only value; the second object differs in x
    // to pin the rejecting arm without relying on a runtime-selected square.
    const state = { go: { only: { x: 5, y: 9 } } };
    const target = { ox: 5, oy: 9 };
    const elsewhere = { ox: 4, oy: 9 };
    assert.ok(INVENT_C.includes(
        'return (obj->ox == go.only.x && obj->oy == go.only.y);',
    ));
    assert.equal(only_here(target, state), true);
    assert.equal(only_here(elsewhere, state), false);
});

test('sobj_at returns the first matching object in the requested floor chain', () => {
    const cStart = INVENT_C.indexOf('sobj_at(int otyp, coordxy x, coordxy y)');
    const cEnd = INVENT_C.indexOf('\n}', cStart) + 2;
    const cBody = INVENT_C.slice(cStart, cEnd);
    const jsStart = INVENT_JS.indexOf('export function sobj_at(');
    const jsEnd = INVENT_JS.indexOf('\n}', jsStart) + 2;
    const jsBody = INVENT_JS.slice(jsStart, jsEnd);
    assert.ok(cStart >= 0 && cEnd > cStart);
    assert.ok(jsStart >= 0 && jsEnd > jsStart);
    assert.match(cBody,
        /for \(otmp = svl\.level\.objects\[x\]\[y\]; otmp; otmp = otmp->nexthere\)[\s\S]*if \(otmp->otyp == otyp\)[\s\S]*return otmp;/u);
    assert.match(jsBody,
        /for \(let obj = grid\[x\]\?\.\[y\] \?\? null; obj; obj = obj\.nexthere\)[\s\S]*if \(obj\.otyp === otyp\) return obj;/u);

    const grid = Array.from({ length: COLNO }, () => Array(ROWNO).fill(null));
    const firstDart = { otyp: DART, nexthere: null };
    const dagger = { otyp: DAGGER, nexthere: null };
    const secondDart = { otyp: DART, nexthere: null };
    firstDart.nexthere = dagger;
    dagger.nexthere = secondDart;
    grid[5][7] = firstDart;
    grid[6][7] = { otyp: DART, nexthere: null };

    const state = { level: { objects: grid } };
    assert.equal(sobj_at(DART, 5, 7, state), firstDart);
    assert.equal(sobj_at(DAGGER, 5, 7, state), dagger);
    assert.equal(sobj_at(0, 5, 7, state), null);
    assert.equal(sobj_at(DART, 6, 7, state), grid[6][7]);
});

test('display_binventory returns zero on an empty ordinary floor square', async () => {
    // The arbitrary in-bounds target (2,3) is a ROOM with no floor or buried
    // objects; C's down-probe continuation then reaches the no-find result.
    const state = {
        level: {
            at: () => ({ typ: ROOM }),
            buriedobjlist: null,
            objects: [],
        },
        u: { uinwater: false },
    };
    assert.equal(await display_binventory(2, 3, true, state), 0);
});

test('display_binventory owns go.only only while querying buried objects', async () => {
    // The target square (2,3) is a ROOM with one buried object. Its ox getter
    // returns the square once for the count, then records the C temp filter
    // during query_objlist and excludes the row so no menu/window is needed.
    const filterDuringQuery = [];
    let oxReads = 0;
    const state = {
        go: { only: { x: 0, y: 0 } },
        level: {
            at: () => ({ typ: ROOM }),
            buriedobjlist: null,
            objects: [],
        },
        u: { uinwater: false },
    };
    const buried = {
        nobj: null,
        get ox() {
            ++oxReads;
            if (oxReads === 1) return 2;
            filterDuringQuery.push({ ...state.go.only });
            return -1;
        },
        oy: 3,
    };
    state.level.buriedobjlist = buried;

    // C assigns go.only immediately before the query and zeros both fields
    // after it; the callback observation below pins that order in JS.
    assert.ok(INVENT_C.includes('go.only.x = x;\n        go.only.y = y;'));
    assert.ok(INVENT_C.includes('go.only.x = go.only.y = 0;'));
    assert.equal(await display_binventory(2, 3, false, state), 1);
    assert.deepEqual(filterDuringQuery, [{ x: 2, y: 3 }]);
    assert.deepEqual(state.go.only, { x: 0, y: 0 });
});

test('consume_obj_charge keeps its C billing-before-decrement order', () => {
    // invent.c:1341-1346 checks unpaid use before spending one charge, then
    // refreshes a known object's inventory after the decrement. The hook is
    // only an adapter seam; omitted hooks retain shk.c's existing behavior.
    const helperStart = INVENT_C.indexOf('consume_obj_charge(\n');
    const helper = INVENT_C.slice(helperStart);
    const checkAt = helper.indexOf('check_unpaid(obj);');
    const decrementAt = helper.indexOf('obj->spe -= 1;', checkAt);
    const updateAt = helper.indexOf('update_inventory();', decrementAt);
    assert.ok(checkAt >= 0 && checkAt < decrementAt && decrementAt < updateAt);

    const state = {
        program_state: { in_moveloop: 1 },
        u: { ushops: ['A'] },
    };
    const object = { unpaid: true, known: true, spe: 2 };
    const events = [];
    consume_obj_charge(object, true, {
        state,
        checkUnpaid(item, checkState) {
            events.push(['check', item.spe, checkState]);
        },
        hooks: {
            updateInventory() { events.push(['update', object.spe]); },
        },
    });
    assert.deepEqual(events, [
        ['check', 2, state],
        ['update', 1],
    ]);

    // Other callers still take the original default path. The current partial
    // shop helper refuses before C's decrement when an unpaid charge is used
    // inside a shop; invent.c's explicit override cannot suppress that.
    const unpaid = { unpaid: true, known: false, spe: 2 };
    assert.throws(
        () => consume_obj_charge(unpaid, true, {
            state: { u: { ushops: ['A'] } },
        }),
        UnsupportedShopError,
    );
    assert.equal(unpaid.spe, 2);
});
