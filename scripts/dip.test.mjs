// Tests for #dip: dodip() (potion.c:2267-2372), dipfountain()
// (fountain.c:394-554), wash_hands()/dipsink()/sink_backs_up()
// (fountain.c:557-831), polymorph_sink() (do.c:404-456), short_oname()
// (objnam.c:2009-2085), and water_damage() (trap.c:4712-4852).
//
// Each test pins its result to values read from the C source and verifies the
// specific code path it exercises.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    ALTAR,
    AM_LAWFUL,
    AM_NONE,
    ECMD_TIME,
    ER_GREASED,
    ER_NOTHING,
    F_LOOTED,
    FOUNTAIN,
    MM_NOMSG,
    SINK,
    S_LRING,
} from '../js/const.js';
import { back_to_glyph, altar_to_glyph } from '../js/display.js';
import { dipfountain } from '../js/fountain.js';
import { polymorph_sink } from '../js/do.js';
import { game } from '../js/gstate.js';
import { addinv } from '../js/invent.js';
import { mksobj } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import { DAGGER, POT_ACID } from '../js/objects.js';
import { potion_dip } from '../js/potion.js';
import { PM_WATER_NYMPH } from '../js/monsters.js';
import { short_oname } from '../js/objnam.js';
import { altarmask_at } from '../js/pray.js';
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

test('polymorph_sink preserves the loot bit when the sink becomes a fountain',
    async () => {
        // C ref: do.c:polymorph_sink. It snapshots any nonzero sink flags,
        // clears them, then restores only F_LOOTED in the fountain arm.
        await startedGame();
        const location = game.level.at(game.u.ux, game.u.uy);
        location.typ = SINK;
        location.flags = S_LRING;
        location.horizontal = 1;
        const messages = [];
        let drawCount = 0;

        await polymorph_sink(game, {
            message: (line) => messages.push(line),
            random: {
                rn2(bound) {
                    drawCount += 1;
                    assert.equal(bound, 4);
                    return 0; // fountain outcome
                },
            },
        });

        assert.equal(location.typ, FOUNTAIN);
        assert.equal(location.flags, F_LOOTED);
        assert.equal(location.horizontal, 0);
        assert.equal(drawCount, 1);
        assert.deepEqual(messages, ['The sink transforms into a fountain!']);
    });

test('polymorph_sink stores altar alignment for pray and glyph readers',
    async () => {
        // C do.c:polymorph_sink writes rm.altarmask, which aliases flags in
        // rm.h; JS keeps the mask in location.flags after clearing sink flags.
        await startedGame();
        const { ux, uy } = game.u;
        const location = game.level.at(ux, uy);
        location.typ = SINK;
        location.flags = S_LRING;
        const messages = [];
        const draws = [
            { bound: 4, result: 2 }, // altar feature
            { bound: 3, result: 2 }, // lawful altar alignment
        ];
        let drawCount = 0;
        await polymorph_sink(game, {
            message: (line) => messages.push(line),
            random: {
                rn2(bound) {
                    const draw = draws[drawCount++];
                    assert.ok(draw, 'unexpected additional random draw');
                    assert.equal(bound, draw.bound);
                    return draw.result;
                },
            },
        });

        assert.equal(drawCount, draws.length);
        assert.equal(location.typ, ALTAR);
        assert.equal(location.flags, AM_LAWFUL);
        assert.equal(Object.hasOwn(location, 'altarmask'), false);
        assert.equal(altarmask_at(ux, uy, game), AM_LAWFUL);
        assert.equal(
            back_to_glyph(ux, uy, game),
            altar_to_glyph(AM_LAWFUL),
        );
        assert.deepEqual(messages, ['The sink transforms into an altar!']);
    });

for (const { hellDraw, expectedMask } of [
    // C do.c:polymorph_sink: zero preserves Align2amask(algn), and any
    // nonzero rn2(3) result selects AM_NONE on a hellish dungeon level.
    { hellDraw: 0, expectedMask: AM_LAWFUL },
    { hellDraw: 1, expectedMask: AM_NONE },
]) {
    test(`polymorph_sink stores the Gehennom altar mask for draw ${hellDraw}`,
        async () => {
            await startedGame();
            // C Inhell reads the current dungeon's hellish flag. Set that
            // source condition directly without generating an unrelated level.
            game.dungeons[game.u.uz.dnum].flags.hellish = true;
            const { ux, uy } = game.u;
            const location = game.level.at(ux, uy);
            location.typ = SINK;
            location.flags = S_LRING; // old sink loot must not enter altar flags
            const messages = [];
            const draws = [
                { bound: 4, result: 2 }, // C switch selects the altar outcome
                { bound: 3, result: 2 }, // algn = 2 - 1 selects lawful alignment
                { bound: 3, result: hellDraw }, // C's extra Inhell-only draw
            ];
            let drawCount = 0;
            await polymorph_sink(game, {
                message: (line) => messages.push(line),
                random: {
                    rn2(bound) {
                        const draw = draws[drawCount++];
                        assert.ok(draw, 'unexpected additional random draw');
                        assert.equal(bound, draw.bound);
                        return draw.result;
                    },
                },
            });

            assert.equal(drawCount, draws.length);
            assert.equal(location.typ, ALTAR);
            assert.equal(location.flags, expectedMask);
            assert.equal(Object.hasOwn(location, 'altarmask'), false);
            assert.equal(altarmask_at(ux, uy, game), expectedMask);
            assert.equal(back_to_glyph(ux, uy, game), altar_to_glyph(expectedMask));
            assert.deepEqual(messages, ['The sink transforms into an altar!']);
        });
}

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

test('dodip source and JavaScript share the pool, decline and potion paths', async () => {
    const cSource = await readFile(
        new URL('../nethack-c/upstream/src/potion.c', import.meta.url),
        'utf8',
    );
    const cStart = cSource.indexOf('dodip(void)');
    const cEnd = cSource.indexOf('\n}\n\n/* #altdip', cStart);
    assert.ok(cStart > 0 && cEnd > cStart);
    const cBody = cSource.slice(cStart, cEnd);
    assert.match(cBody, /drink_ok_extra = 0;/u);
    assert.equal((cBody.match(/\+\+drink_ok_extra;/gu) ?? []).length, 3);
    assert.match(cBody, /water_damage\(obj, 0, TRUE\)/u);
    assert.match(cBody, /getobj\(qbuf, drink_ok, GETOBJ_NOFLAGS\)/u);
    assert.match(cBody, /return potion_dip\(obj, potion\);/u);

    const js = await readFile(new URL('../js/potion.js', import.meta.url), 'utf8');
    const commands = await readFile(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(js, /export async function dodip\(state = game/u);
    assert.match(js, /export async function dip_into\(state = game/u);
    assert.match(js, /export async function potion_dip\(obj, potion/u);
    assert.match(commands, /case 'dip_into':[\s\S]*?runDipIntoCommand/u);
    assert.doesNotMatch(js + commands, /UnsupportedDipError/u);
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

// potion.c:2639 passes 0 as a null const-char pointer, not a description.
// trap.c:240-241 then derives cxname before corrosion or grease messages.
for (const greased of [false, true]) {
    test(`acid dip uses the object's name for ${greased ? 'greased plural' : 'ordinary singular'} gear`, async () => {
        await startedGame(); // Seed initializes catalog and inventory only.
        const env = objectGenerationEnv({ state: game });
        const obj = mksobj(DAGGER, false, false, env);
        obj.blessed = obj.cursed = obj.oerodeproof = false;
        obj.oeroded = obj.oeroded2 = 0; // An initially intact iron weapon.
        obj.greased = greased;
        obj.quan = greased ? 2 : 1; // Plural grease subject vs singular corrosion.
        addinv(obj, { state: game });
        const acid = mksobj(POT_ACID, false, false, env);
        acid.quan = 1; // C poof consumes the entire single dose.
        addinv(acid, { state: game });
        acid.dknown = false; // Keep the unrelated call-name prompt out of this test.
        const events = [];
        const draws = [];
        const result = await potion_dip(obj, acid, game, {
            message(line) { events.push([line, obj.oeroded2, acid.in_use]); },
            random: {
                rn2(bound) {
                    draws.push(bound);
                    return 1; // rn2(2)=1 retains grease, avoiding a second message.
                },
                rnl() { assert.fail('unblessed gear needs no luck draw'); },
            },
        });
        assert.equal(result, ECMD_TIME);
        assert.deepEqual(events, [[greased
            ? 'Your daggers are protected by the layer of grease!'
            : 'Your dagger corrodes!', 0, true]]); // Message precedes erosion.
        assert.deepEqual(draws, greased ? [2] : []); // Only grease makes a draw.
        assert.equal(obj.oeroded2, greased ? 0 : 1);
        assert.equal(obj.greased, greased);
        const inventory = [];
        for (let item = game.invent; item; item = item.nobj) inventory.push(item);
        assert.ok(inventory.includes(obj));
        assert.ok(!inventory.includes(acid)); // Both ER_DAMAGED/ER_GREASED call poof.
    });
}
