import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FIRE_RES, OBJ_DELETED, ROWNO, COLNO, ROOM } from '../js/const.js';

const C_MON_SOURCE = readFileSync('nethack-c/upstream/src/mon.c', 'utf8');
const JS_MON_SOURCE = readFileSync('js/mon.js', 'utf8');

test('meatobj imports and applies source slimeproof for green slime glob', () => {
    const cStart = C_MON_SOURCE.indexOf('meatobj(struct monst *mtmp)');
    const cEnd = C_MON_SOURCE.indexOf('\n#undef mstoning', cStart);
    const jsStart = JS_MON_SOURCE.indexOf('export async function meatobj(');
    const jsEnd = JS_MON_SOURCE.indexOf('\n}', jsStart);
    const cFunction = C_MON_SOURCE.slice(cStart, cEnd);
    const jsFunction = JS_MON_SOURCE.slice(jsStart, jsEnd);

    assert.ok(cStart >= 0 && cEnd > cStart, 'C meatobj source range exists');
    assert.ok(jsStart >= 0 && jsEnd > jsStart, 'JS meatobj source range exists');
    assert.match(cFunction, /GLOB_OF_GREEN_SLIME[\s\S]{0,80}slimeproof\(mtmp->data\)/u);
    assert.match(jsFunction, /GLOB_OF_GREEN_SLIME && !slimeproof\(mtmp\.data\)/u);
    assert.match(JS_MON_SOURCE, /import \{[\s\S]*?\bslimeproof\b[\s\S]*?\} from '\.\/mondata\.js';/u);
});
import { GameMap } from '../js/game.js';
import {
    m_consume_obj,
    meatcorpse,
    meatmetal,
    mon_give_prop,
    mpickgold,
} from '../js/mon.js';
import { mpickobj } from '../js/steal.js';
import {
    PM_GELATINOUS_CUBE,
    PM_GREEN_SLIME,
    PM_HUMAN,
    PM_PURPLE_WORM,
    PM_ROCK_MOLE,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { newObject, place_object } from '../js/obj.js';
import {
    CORPSE,
    GOLD_PIECE,
    GLOB_OF_GREEN_SLIME,
    IRON_CHAIN,
    objects_globals_init,
} from '../js/objects.js';

function makeState() {
    const state = {
        context: {
            achieveo: { mines_prize_oid: 0, soko_prize_oid: 0 },
        },
        flags: { verbose: false },
        level: new GameMap(),
        dungeons: [{
            depth_start: 1,
            ledger_start: 0,
            num_dunlevs: 29,
            entry_lev: 1,
            flags: { hellish: false },
        }],
        u: {
            uprops: [],
            ux: 5,
            uy: 5,
            uz: { dnum: 0, dlevel: 1 },
        },
    };
    objects_globals_init(state);
    monst_globals_init(state);
    for (const column of state.level.locations)
        for (const location of column) location.typ = ROOM;
    state.viz_array = Array.from({ length: ROWNO }, () => new Uint8Array(COLNO));
    return state;
}

function random() {
    return {
        d: (count) => count,
        rn2: () => 5,
        rnd: (bound) => bound,
        rn1: (count, base) => base,
        rne: () => 1,
    };
}

function monster(state, pmidx) {
    return newMonster({
        data: state.mons[pmidx],
        mhp: 20,
        mhpmax: 20,
        mcanmove: true,
        mcansee: true,
        mx: 5,
        my: 5,
        mnum: pmidx,
    });
}

function floorObject(state, otyp, overrides = {}) {
    const type = state.objects[otyp];
    const obj = newObject({
        oclass: type.oc_class,
        otyp,
        owt: type.oc_weight,
        quan: 1,
        ...overrides,
    });
    place_object(obj, 5, 5, { state, random: random() });
    return obj;
}

test('m_consume_obj turns an eater into green slime after consuming a glob', async () => {
    const state = makeState();
    reset_mvitals(state);
    const cube = monster(state, PM_GELATINOUS_CUBE);
    const globType = state.objects[GLOB_OF_GREEN_SLIME];
    const glob = newObject({
        oclass: globType.oc_class,
        otyp: GLOB_OF_GREEN_SLIME,
        owt: globType.oc_weight,
        quan: 1,
    });
    mpickobj(cube, glob, { state, random: random() });

    await m_consume_obj(cube, glob, {
        state,
        random: random(),
        canSpotMonster: () => false,
        redrawSquare: () => {},
    });

    assert.equal(glob.where, OBJ_DELETED);
    assert.equal(cube.data, state.mons[PM_GREEN_SLIME]);
});

test('meatmetal consumes the first acceptable metallic object', async () => {
    const state = makeState();
    const mole = monster(state, PM_ROCK_MOLE);
    const chain = floorObject(state, IRON_CHAIN);

    assert.equal(
        await meatmetal(mole, { state, random: random() }),
        1,
    );
    assert.notEqual(chain.where, 1); // OBJ_FLOOR; delobj() marks it deleted.
    assert.equal(state.level.objects[5][5], null);
});

test('meatmetal routes offscreen crunch through the C acoustics gate', async () => {
    for (const [acoustics, expectedMessages] of [
        [false, []],
        [true, ['You hear a crunching sound.']],
    ]) {
        const state = makeState();
        state.flags.verbose = true;
        state.flags.acoustics = acoustics;
        const mole = monster(state, PM_ROCK_MOLE);
        floorObject(state, IRON_CHAIN);
        const draws = [];
        const messages = [];
        const random = {
            rn2(bound) { draws.push(['rn2', bound]); return 99; },
            rnd(bound) { draws.push(['rnd', bound]); return bound; },
        };

        assert.equal(await meatmetal(mole, {
            state,
            random,
            message: async (line) => messages.push(line),
        }), 1);
        assert.deepEqual(messages, expectedMessages);
        assert.deepEqual(draws, [
            ['rn2', 100], // meatmetal's object resistance check
            ['rn2', 100], // delobj's ordinary-object resistance check
            ['rnd', 25], // possible rock pile after consumption
        ]);
    }
});

test('meatcorpse consumes one ordinary corpse and leaves the monster alive', async () => {
    const state = makeState();
    const worm = monster(state, PM_PURPLE_WORM);
    const corpse = floorObject(state, CORPSE, { corpsenm: PM_HUMAN });

    assert.equal(
        await meatcorpse(worm, { state, random: random() }),
        1,
    );
    assert.notEqual(corpse.where, 1); // OBJ_FLOOR; delobj() marks it deleted.
    assert.equal(worm.mhp, 20);
});

test('mon_give_prop records resistance and mpickgold transfers coins', async () => {
    const state = makeState();
    const mole = monster(state, PM_ROCK_MOLE);
    await mon_give_prop(mole, FIRE_RES, { state });
    assert.equal(mole.mintrinsics & 1, 1);

    const gold = floorObject(state, GOLD_PIECE);
    mpickgold(mole, { state });
    assert.equal(gold.where, 4); // OBJ_MINVENT in monst.h's object-location enum.
    assert.equal(mole.minvent, gold);
});
