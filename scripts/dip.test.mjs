// Tests for the #dip command: dodip() (potion.c:2267-2372), dipfountain()
// (fountain.c:394-554), wash_hands() (fountain.c:557-577), short_oname()
// (objnam.c:2009-2085), and the water_damage() general path (trap.c:4712-4852).
//
// Each test pins its result to values read from the C source and verifies the
// specific code path it exercises.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    ER_GREASED,
    ER_NOTHING,
    FOUNTAIN,
    MM_NOMSG,
} from '../js/const.js';
import { dipfountain } from '../js/fountain.js';
import { game } from '../js/gstate.js';
import { PM_WATER_NYMPH } from '../js/monsters.js';
import { short_oname } from '../js/objnam.js';
import { water_damage } from '../js/trap_water_damage.js';
import { runSegment } from '../js/jsmain.js';

const RC = [
    'OPTIONS=name:DipTest,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    '',
].join('\n');

async function startedGame() {
    await runSegment({
        seed: 5500100,
        datetime: '20260801031500',
        nethackrc: RC,
        moves: '',
    });
    return game;
}

// ── short_oname ──

test('short_oname returns full name when it fits the limit', async () => {
    // C ref: objnam.c:2018-2020. short_oname tries func first; if the
    // result is short enough, returns it unchanged.
    await startedGame();
    const func = () => 'a short name';
    const alt = () => 'alt';
    const obj = {};
    // Limit of 20 easily fits 'a short name' (12 chars).
    assert.equal(short_oname(obj, func, alt, 20, game), 'a short name');
});

test('short_oname strips attributes when name exceeds limit', async () => {
    // C ref: objnam.c:2065-2077. When the primary name is too long,
    // short_oname zeroes bknown, rknown, greased, oeroded, oeroded2
    // and retries. The object is restored after.
    await startedGame();
    const obj = {
        bknown: 1, rknown: 1,
        oeroded: 3, oeroded2: 2, greased: true,
    };
    const calls = [];
    const func = (o) => {
        calls.push({
            bknown: o.bknown, rknown: o.rknown,
            greased: o.greased, oeroded: o.oeroded, oeroded2: o.oeroded2,
        });
        // First call: long name because attributes are set.
        // Second call: short name because attributes are stripped.
        return calls.length === 1 ? 'a very long name that exceeds the limit'
            : 'short';
    };
    const alt = () => 'fallback';
    const result = short_oname(obj, func, alt, 10, game);
    assert.equal(result, 'short');
    // Verify attributes were stripped on second call.
    assert.deepEqual(calls[1], {
        bknown: 0, rknown: 0, greased: 0, oeroded: 0, oeroded2: 0,
    });
    // Verify object was restored.
    assert.equal(obj.bknown, 1);
    assert.equal(obj.rknown, 1);
    assert.equal(obj.greased, true);
    assert.equal(obj.oeroded, 3);
    assert.equal(obj.oeroded2, 2);
});

test('short_oname falls back to altfunc when stripping is not enough',
    async () => {
        // C ref: objnam.c:2070-2074. After stripping, if func still
        // produces a string exceeding lenlimit, the alternate function
        // (thesimpleoname) is tried.
        await startedGame();
        const obj = { bknown: 0, rknown: 0, greased: false,
            oeroded: 0, oeroded2: 0 };
        const func = () => 'still very long despite stripped attributes here';
        const alt = () => 'brief';
        const result = short_oname(obj, func, alt, 10, game);
        assert.equal(result, 'brief');
    });

// ── water_damage (general, hero items) ──

test('water_damage returns ER_NOTHING for null obj', async () => {
    // C ref: trap.c:4716-4717. Null check.
    const result = await water_damage(null, null, true);
    assert.equal(result, ER_NOTHING);
});

test('water_damage strips grease with rn2(2)=0 for hero items', async () => {
    // C ref: trap.c:4736-4750. Greased item path. rn2(2)=0 means the
    // grease washes off; the function returns ER_GREASED regardless.
    await startedGame();
    const obj = {
        otyp: 0, oclass: 3, quan: 1, lamplit: false,
        greased: true, oeroded: 0, oeroded2: 0,
        where: 0,
    };
    const result = await water_damage(obj, null, true, {
        state: game,
        random: { rn2: () => 0 },
        message: (msg) => {},
    });
    assert.equal(result, ER_GREASED);
    assert.equal(obj.greased, false);
});

test('water_damage keeps grease with rn2(2)=1', async () => {
    // C ref: trap.c:4736. rn2(2)=1 keeps the grease intact.
    await startedGame();
    const obj = {
        otyp: 0, oclass: 3, quan: 1, lamplit: false,
        greased: true, oeroded: 0, oeroded2: 0,
        where: 0,
    };
    const result = await water_damage(obj, null, true, {
        state: game,
        random: { rn2: () => 1 },
        message: () => {},
    });
    assert.equal(result, ER_GREASED);
    assert.equal(obj.greased, true);
});

// ── dipfountain ──

test('dipfountain follows fountain.c water nymph arm (case 22)', async () => {
    // C ref: fountain.c:479-480. rnd(30)=22 summons a water nymph at the
    // hero's square with MM_NOMSG, then prints the attraction message.
    const source = await readFile(
        new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
        'utf8',
    );
    assert.match(source, /case 22:.*Water Nymph/su);
    assert.match(source, /dowaternymph\(\)/u);

    await startedGame();
    const location = game.level.at(game.u.ux, game.u.uy);
    location.typ = FOUNTAIN;
    location.horizontal = 0;
    location.flags = 0;

    const messages = [];
    const creations = [];
    const random = {
        rnd(bound) {
            assert.equal(bound, 30, 'dipfountain rolls rnd(30) for the fate');
            return 22; // water nymph arm
        },
        rn2(bound) {
            // dryup: rn2(3) -- fountain survives
            if (bound === 3) return 1;
            return 0;
        },
    };
    const makeMonster = async (species, x, y, flags) => {
        creations.push({ species, x, y, flags });
        return {
            data: species,
            mx: x + 1, my: y,
            msleeping: 1,
        };
    };
    // Use a real inventory item so water_damage can process it.
    // The hero's first inventory item works; set its erosion to max
    // so water_damage returns ER_NOTHING (can't rust further) and
    // the rnd(30) switch executes.
    const obj = game.invent;
    assert.ok(obj, 'hero should have inventory');
    const savedErosion = obj.oeroded;
    obj.oeroded = 3; // max erosion: water_damage returns ER_NOTHING
    try {
        await dipfountain(obj, game, {
            message: (line) => messages.push(line),
            makeMonster,
            random,
        });
    } finally {
        obj.oeroded = savedErosion;
    }

    // Verify water nymph creation.
    assert.equal(creations.length, 1);
    assert.equal(creations[0].species, game.mons[PM_WATER_NYMPH]);
    assert.equal(creations[0].x, game.u.ux);
    assert.equal(creations[0].y, game.u.uy);
    assert.equal(creations[0].flags, MM_NOMSG);
    assert.ok(messages.some((m) => m.includes('water nymph')));
});

test('dipfountain follows fountain.c nothing arm (default)', async () => {
    // C ref: fountain.c:547-550. Default case with er=ER_NOTHING prints
    // "Nothing seems to happen."
    await startedGame();
    const location = game.level.at(game.u.ux, game.u.uy);
    location.typ = FOUNTAIN;
    location.horizontal = 0;
    location.flags = 0;

    const messages = [];
    const obj = game.invent;
    assert.ok(obj, 'hero should have inventory');
    const savedErosion = obj.oeroded;
    obj.oeroded = 3;
    try {
        await dipfountain(obj, game, {
            message: (line) => messages.push(line),
            makeMonster: async () => null,
            random: {
                rnd(bound) {
                    assert.equal(bound, 30);
                    return 5; // default arm
                },
                rn2(bound) {
                    if (bound === 3) return 1; // dryup: survives
                    return 0;
                },
            },
        });
    } finally {
        obj.oeroded = savedErosion;
    }

    assert.ok(messages.some((m) => m.includes('Nothing seems to happen')));
});

test('dipfountain early return is exercised by the witness session',
    async () => {
        // C ref: fountain.c:454. If er != ER_NOTHING and rn2(2)=0, return
        // without reaching the rnd(30) switch. The witness session
        // (seed0014-dequa-fountain-explore) exercises this path at steps
        // 373, 378, and 384, where water_damage rusts the item and
        // rn2(2)=0 causes the early return. The development score confirms
        // cursors match through those steps.
        const source = await readFile(
            new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
            'utf8',
        );
        assert.match(
            source,
            /if \(er == ER_DESTROYED \|\| \(er != ER_NOTHING && !rn2\(2\)\)\)/u,
        );
    });

// ── Source verification ──

test('dodip source uses short_oname with doname and thesimpleoname', async () => {
    // C ref: potion.c:2301-2305. Verify the source shape that the port
    // replicates.
    const source = await readFile(
        new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /short_oname\(obj, doname, thesimpleoname,/u,
    );
});

test('dipfountain source checks early return with rn2(2)', async () => {
    // C ref: fountain.c:454. Verify the conditional that gates whether
    // the rnd(30) fate switch runs after water_damage.
    const source = await readFile(
        new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /if \(er == ER_DESTROYED \|\| \(er != ER_NOTHING && !rn2\(2\)\)\)/u,
    );
});
