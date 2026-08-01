import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    CORR,
    HOLE,
    IN_SIGHT,
    LAVAPOOL,
    MOAT,
    OBJ_FLOOR,
    OBJ_FREE,
    PIT,
    POOL,
    ROOM,
    TRAPDOOR,
} from '../js/const.js';
import { flooreffects } from '../js/do.js';
import { GameMap } from '../js/game.js';
import { BOULDER, POTION_CLASS, POT_WATER, ROCK } from '../js/objects.js';

// An arbitrary interior square that no fixture below places the hero on
// unless it says so.
const DROP_X = 12;
const DROP_Y = 8;
// A second square, distinct from the drop, so that hero-position arms can be
// switched on and off without moving the object.
const AWAY_X = 30;
const AWAY_Y = 3;

class RefusedFloorEffect extends Error {}

function refuse(reason) {
    const error = new RefusedFloorEffect(reason);
    error.reason = reason;
    throw error;
}

function fixture({
    typ = ROOM, temperature = 0, monMoving = false, seen = true,
} = {}) {
    const level = new GameMap();
    level.at(DROP_X, DROP_Y).typ = typ;
    level.flags.temperature = temperature;
    const state = {
        level,
        context: { mon_moving: monMoving },
        u: { ux: AWAY_X, uy: AWAY_Y, utrap: 0, utraptype: 0 },
        // cansee() reads this directly; the altar arm is the only branch here
        // that consults it, and it needs the drop square lit.
        viz_array: Array.from({ length: 21 }, () => new Array(80).fill(0)),
    };
    if (seen) state.viz_array[DROP_Y][DROP_X] = IN_SIGHT;
    return state;
}

function object(overrides = {}) {
    return {
        otyp: ROCK,
        oclass: 0,
        where: OBJ_FREE,
        globby: false,
        // A landing object arrives with stale links; flooreffects() clears
        // both before any arm can follow them.
        nobj: {},
        nexthere: {},
        ...overrides,
    };
}

function land(state, obj, x = DROP_X, y = DROP_Y) {
    return flooreffects(obj, x, y, 'fall', { state, unsupported: refuse });
}

test('flooreffects answers FALSE on an ordinary floor square', () => {
    const state = fixture();
    const obj = object();
    assert.equal(land(state, obj), false);
    // do.c:176-177: the object arrives with whatever chain links its previous
    // home left, and both are cleared before water_damage() could follow one.
    assert.equal(obj.nobj, null);
    assert.equal(obj.nexthere, null);
});

test('flooreffects answers FALSE on a corridor and on two spared altars', () => {
    // The potion arm needs ROOM or CORR; a corridor at temperature zero still
    // falls through it.
    assert.equal(
        land(fixture({ typ: CORR }), object({
            otyp: POT_WATER, oclass: POTION_CLASS,
        })),
        false,
    );
    // do.c:315-316's altar arm is `svc.context.mon_moving &&
    // IS_ALTAR(levl[x][y].typ) && cansee(x,y)`. Each of the two cases below
    // drops one of the first two terms while leaving the altar in place. A
    // hero's own drop clears mon_moving...
    assert.equal(land(fixture({ typ: ALTAR }), object()), false);
    // ...and a pet that wandered out of the hero's sight clears cansee(),
    // which is the case the running game reaches: mklev.c:994 rolls an altar
    // into an ordinary room on any level, and a pet drops wherever it stands.
    assert.equal(
        land(fixture({ typ: ALTAR, monMoving: true, seen: false }), object()),
        false,
    );
});

test('flooreffects refuses every arm this port has not reached', () => {
    const cases = [
        {
            name: 'boulder',
            state: fixture(),
            obj: object({ otyp: BOULDER }),
            reason: `a boulder landing at <${DROP_X},${DROP_Y}>`,
        },
        {
            name: 'lava',
            state: fixture({ typ: LAVAPOOL }),
            obj: object(),
            reason: 'an object landing on lava',
        },
        {
            name: 'pool',
            state: fixture({ typ: POOL }),
            obj: object(),
            reason: 'an object landing in water',
        },
        {
            name: 'moat',
            state: fixture({ typ: MOAT }),
            obj: object(),
            reason: 'an object landing in water',
        },
        {
            name: 'glob',
            state: fixture(),
            obj: object({ globby: true }),
            reason: 'a glob landing on the floor',
        },
        {
            name: 'altar while a monster moves',
            state: fixture({ typ: ALTAR, monMoving: true }),
            obj: object(),
            reason: 'an object landing on an altar while a monster moves',
        },
        {
            name: 'potion on hot ground',
            // svl.level.flags.temperature is positive only in Gehennom, which
            // no level the port generates reaches; one is enough to pin the
            // comparison.
            state: fixture({ temperature: 1 }),
            obj: object({ otyp: POT_WATER, oclass: POTION_CLASS }),
            reason: 'a potion landing on the hot ground of a hot level',
        },
    ];
    for (const { name, state, obj, reason } of cases) {
        assert.throws(
            () => land(state, obj),
            (error) => error instanceof RefusedFloorEffect
                && error.reason === reason,
            name,
        );
    }
});

test('flooreffects refuses a seen pit or shaft only under the hero', () => {
    for (const ttyp of [PIT, HOLE, TRAPDOOR]) {
        const underHero = fixture();
        underHero.u.ux = DROP_X;
        underHero.u.uy = DROP_Y;
        underHero.level.traps = [{
            ttyp, tx: DROP_X, ty: DROP_Y, tseen: true,
        }];
        assert.throws(
            () => land(underHero, object()),
            (error) => error instanceof RefusedFloorEffect
                && error.reason
                    === 'an object landing in the pit or shaft the hero is in',
            `trap type ${ttyp} under the hero`,
        );

        // do.c:288 gates the whole arm on u_at(x, y). The same trap on a
        // square the hero is not standing on takes no arm at all.
        const elsewhere = fixture();
        elsewhere.level.traps = [{
            ttyp, tx: DROP_X, ty: DROP_Y, tseen: true,
        }];
        assert.equal(land(elsewhere, object()), false, `trap type ${ttyp}`);

        // An unseen trap is invisible to uteetering_at_seen_pit() and
        // uescaped_shaft() alike.
        const unseen = fixture();
        unseen.u.ux = DROP_X;
        unseen.u.uy = DROP_Y;
        unseen.level.traps = [{
            ttyp, tx: DROP_X, ty: DROP_Y, tseen: false,
        }];
        assert.equal(land(unseen, object()), false, `unseen type ${ttyp}`);
    }
});

test('flooreffects rejects an object that is not free', () => {
    assert.throws(
        () => land(fixture(), object({ where: OBJ_FLOOR })),
        /flooreffects: obj not free/u,
    );
    assert.throws(
        () => flooreffects(object(), DROP_X, DROP_Y, 'fall', {
            state: fixture(),
        }),
        /flooreffects requires an unsupported operation/u,
    );
});
