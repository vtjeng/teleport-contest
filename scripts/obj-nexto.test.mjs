import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FOOD_CLASS, GLOB_OF_GREEN_SLIME, objects_globals_init } from '../js/objects.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { init_objects } from '../js/o_init.js';
import { newObject, obj_nexto, obj_nexto_xy } from '../js/obj.js';

const C_MKOBJ = readFileSync(
    new URL('../nethack-c/upstream/src/mkobj.c', import.meta.url), 'utf8',
);
const C_MON = readFileSync(
    new URL('../nethack-c/upstream/src/mon.c', import.meta.url), 'utf8',
);
const C_DO = readFileSync(
    new URL('../nethack-c/upstream/src/do.c', import.meta.url), 'utf8',
);
const JS_OBJ = readFileSync(new URL('../js/obj.js', import.meta.url), 'utf8');
const JS_MON = readFileSync(new URL('../js/mon.js', import.meta.url), 'utf8');
const JS_DO = readFileSync(new URL('../js/do.js', import.meta.url), 'utf8');

test('obj_nexto passes its caller RNG through the recursive source search', () => {
    const cWrapperStart = C_MKOBJ.indexOf('obj_nexto(struct obj *otmp)');
    const cWrapperEnd = C_MKOBJ.indexOf('\n}', cWrapperStart) + 2;
    const cSearchStart = C_MKOBJ.indexOf('obj_nexto_xy(struct obj *obj');
    const cSearchEnd = C_MKOBJ.indexOf('\n}', cSearchStart) + 2;
    assert.ok(cWrapperStart >= 0 && cWrapperEnd > cWrapperStart);
    assert.ok(cSearchStart >= 0 && cSearchEnd > cSearchStart);
    const cWrapper = C_MKOBJ.slice(cWrapperStart, cWrapperEnd);
    const cSearch = C_MKOBJ.slice(cSearchStart, cSearchEnd);
    assert.match(cWrapper, /obj_nexto_xy\(otmp, otmp->ox, otmp->oy, TRUE\)/u);
    assert.deepEqual(
        [...cSearch.matchAll(/rn2\(2\)/gu)].map(() => 2),
        [2, 2],
        'C draws one binary direction for each axis when recursive search begins',
    );
    assert.match(cSearch, /obj_nexto_xy\(obj, fx, fy, FALSE\)/u);

    const jsWrapper = JS_OBJ.slice(
        JS_OBJ.indexOf('export function obj_nexto('),
        JS_OBJ.indexOf('\n}', JS_OBJ.indexOf('export function obj_nexto(')) + 2,
    );
    const jsSearch = JS_OBJ.slice(
        JS_OBJ.indexOf('export function obj_nexto_xy('),
        JS_OBJ.indexOf('\n}', JS_OBJ.indexOf('export function obj_nexto_xy(')) + 2,
    );
    assert.match(jsWrapper,
        /obj_nexto_xy\(otmp, otmp\.ox, otmp\.oy, true, state, random\)/u);
    assert.match(jsSearch, /const drawRn2 = random\?\.rn2 \?\? coreRn2/u);
    assert.match(jsSearch, /drawRn2\(2\)/u);
    assert.match(jsSearch,
        /obj_nexto_xy\(obj, fx, fy, false, state, random\)/u);

    const cCorpse = C_MON.slice(C_MON.indexOf('make_corpse(struct monst *mtmp'));
    const cFloor = C_DO.slice(C_DO.indexOf('flooreffects('));
    assert.match(cCorpse, /obj_nexto\(obj\)/u);
    assert.match(cFloor, /obj_nexto_xy\(globbyobj, x, y, TRUE\)/u);
    assert.match(JS_MON, /obj_nexto\(obj, state, objectEnv\.random\)/u);
    assert.match(JS_DO,
        /obj_nexto_xy\(\s*globbyobj, x, y, true, state, random,/u);
});

test('obj_nexto_xy uses an injected random stream for the two C direction draws', () => {
    const state = resetGame();
    state.level = new GameMap();
    objects_globals_init(state);
    init_objects(state, () => 0);
    const glob = newObject({
        otyp: GLOB_OF_GREEN_SLIME, // C's make_corpse() creates this green-slime glob.
        oclass: FOOD_CLASS,
        globby: true,
    });
    const searchX = 63; // An interior column lets both random search directions stay valid.
    const searchY = 4; // An interior row with no matching neighboring glob keeps the search unresolved.
    glob.ox = searchX;
    glob.oy = searchY;
    const calls = [];
    const random = {
        rn2(bound) {
            calls.push(bound); // C calls rn2(2) once for x and once for y.
            return 1; // The selected direction is the negative coordinate step.
        },
    };

    assert.equal(obj_nexto(glob, state, random), null);
    assert.deepEqual(calls, [2, 2]);
    assert.equal(obj_nexto_xy(glob, searchX, searchY, false, state, random), null);
    assert.deepEqual(calls, [2, 2], 'recurs=false returns before either RNG draw');
});
