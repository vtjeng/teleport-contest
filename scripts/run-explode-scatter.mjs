#!/usr/bin/env node

// Fresh source-owner contract for explode.c scatter(). The recipe initializes
// a real production GameState through runSegment(); the verifier then invokes
// the exported scatter entry point with only the lifecycle seams that belong
// to later caller owners. This keeps the helper's C movement and landing
// contract independently repeatable until a direct gameplay caller lands.

import assert from 'node:assert/strict';

import { game } from '../js/gstate.js';
import {
    scatter,
} from '../js/explode.js';
import { runSegment } from '../js/jsmain.js';

export const SCATTER_SOURCE_RECIPE = Object.freeze({
    version: 5,
    segments: Object.freeze([Object.freeze({
        seed: 4820711,
        datetime: '20300415091723',
        nethackrc: [
            'OPTIONS=name:ScatterProbe,role:Valkyrie,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,!autopickup',
            '',
        ].join('\n'),
        moves: ' ',
    })]),
});

export async function runExplodeScatterSourceContract() {
    const segment = SCATTER_SOURCE_RECIPE.segments[0];
    await runSegment(segment);
    const x = game.u.ux;
    const y = game.u.uy;
    const object = {
        otyp: 1,
        oclass: 2,
        quan: 1,
        owt: 40,
        spe: 0,
        ox: x,
        oy: y,
        where: 1,
    };
    const randomCalls = [];
    const landed = [];
    const total = await scatter(x, y, 3, 0, object, game, {
        random: {
            rn2: (bound) => {
                randomCalls.push(`rn2(${bound})`);
                return 3;
            },
            rnd: (bound) => {
                randomCalls.push(`rnd(${bound})`);
                return 2;
            },
        },
        shopOrigin: false,
        extractObject: (value) => { value.where = 0; },
        placeObject: (value, px, py) => {
            value.where = 1;
            value.ox = px;
            value.oy = py;
            landed.push([px, py]);
        },
        stackObject: () => {},
        floorEffects: () => false,
        terrainAt: () => 100,
        closedDoor: () => false,
        isSink: () => false,
        monsterAt: () => null,
        heroAt: () => false,
        canSee: () => false,
        newsym: () => {},
        maybeUnhideAt: () => {},
    });

    assert.equal(total, 1);
    assert.deepEqual(randomCalls, ['rn2(8)', 'rnd(2)']);
    assert.deepEqual(landed, [[x + 2, y - 2]]);
    return { total, randomCalls, landed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const result = await runExplodeScatterSourceContract();
    console.log(
        `EXPLODE SCATTER SOURCE CONTRACT: PASS: total=${result.total}, `
        + `rng=${result.randomCalls.join(',')}, landing=${JSON.stringify(result.landed)}`,
    );
}
