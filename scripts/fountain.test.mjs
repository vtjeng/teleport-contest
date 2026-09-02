// fountain.c dowatersnakes() (38-60).
//
// The running witness reaches the ordinary sighted, non-hallucinating arm.
// This test keeps that arm's source shape visible while isolating its four
// observable responsibilities: rn1(5, 2), the stream message, MM_NOMSG
// moccasin creation at the hero's square, and the common dryup tail.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    ALTAR,
    FAINTING,
    FOUNTAIN,
    G_GONE,
    MM_NOMSG,
    ROOM,
    SICK,
    SICK_VOMITABLE,
} from '../js/const.js';
import { drinkfountain } from '../js/fountain.js';
import { game } from '../js/gstate.js';
import { UnsupportedEatError, vomit } from '../js/eat.js';
import {
    PM_ACID_BLOB,
    PM_SEWER_RAT,
    PM_WATER_MOCCASIN,
    PM_YELLOW_DRAGON,
} from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';

const RC = [
    'OPTIONS=name:SnakeTest,role:Wizard,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    '',
].join('\n');

async function startedGame() {
    await runSegment({
        seed: 7712200,
        datetime: '20260801031500',
        nethackrc: RC,
        moves: '',
    });
    return game;
}

test('dowatersnakes follows fountain.c for the ordinary visible arm',
    async () => {
        const source = await readFile(
            new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
            'utf8',
        );
        assert.match(source, /int num = rn1\(5, 2\);/u);
        assert.match(
            source,
            /makemon\(&mons\[PM_WATER_MOCCASIN\], u\.ux, u\.uy,\s+MM_NOMSG\)/u,
        );

        await startedGame();
        const location = game.level.at(game.u.ux, game.u.uy);
        location.typ = FOUNTAIN;
        location.horizontal = 0;
        location.flags = 0;

        const messages = [];
        const creations = [];
        const random = {
            rnd(bound) {
                assert.equal(bound, 30);
                return 22;
            },
            rn1(bound, base) {
                assert.equal(bound, 5);
                assert.equal(base, 2);
                return 4;
            },
            rn2(bound) {
                assert.equal(bound, 3);
                return 0;
            },
        };
        const makeMonster = async (species, x, y, flags) => {
            creations.push({ species, x, y, flags });
            return {
                data: species,
                mx: x + 1,
                my: y,
            };
        };

        await drinkfountain(game, { message: (line) => messages.push(line),
            makeMonster, random });

        assert.deepEqual(messages, [
            'An endless stream of snakes pours forth!',
            'The fountain dries up!',
        ]);
        assert.equal(creations.length, 4);
        for (const creation of creations) {
            assert.equal(creation.species, game.mons[PM_WATER_MOCCASIN]);
            assert.deepEqual([creation.x, creation.y], [game.u.ux, game.u.uy]);
            assert.equal(creation.flags, MM_NOMSG);
        }
        assert.equal(location.typ, ROOM);
    });

test('dowatersnakes leaves unsupported visibility/extinction arms fail-closed',
    async () => {
        await startedGame();
        const location = game.level.at(game.u.ux, game.u.uy);
        location.typ = FOUNTAIN;
        location.horizontal = 0;
        location.flags = 0;
        game.mvitals[PM_WATER_MOCCASIN].mvflags |= G_GONE;

        await assert.rejects(
            () => drinkfountain(game, {
                random: { rnd: () => 22, rn1: () => 4, rn2: () => 1 },
                message: () => {},
            }),
            /extinct water-snake fountain effect/u,
        );
    });

test('drinkfountain follows fountain.c foul-water fate 20', async () => {
    const source = await readFile(
        new URL('../nethack-c/upstream/src/fountain.c', import.meta.url),
        'utf8',
    );
    assert.match(
        source,
        /case 20:[\s\S]*?pline_The\("water is foul!  You gag and vomit\."\);[\s\S]*?morehungry\(rn1\(20, 11\)\);[\s\S]*?vomit\(\);/u,
    );

    await startedGame();
    const location = game.level.at(game.u.ux, game.u.uy);
    location.typ = FOUNTAIN;
    location.horizontal = 0;
    location.flags = 0;
    game.multi = 0;
    const hungerBefore = game.u.uhunger;
    const messages = [];
    const draws = [];
    const random = {
        rnd(bound) {
            draws.push(`rnd(${bound})`);
            assert.equal(bound, 30);
            return 20;
        },
        rn1(bound, base) {
            draws.push(`rn1(${bound},${base})`);
            assert.equal(bound, 20);
            assert.equal(base, 11);
            return 20;
        },
        rn2(bound) {
            draws.push(`rn2(${bound})`);
            assert.equal(bound, 3);
            return 0;
        },
    };

    await drinkfountain(game, {
        message: (line) => messages.push(line),
        random,
    });

    assert.deepEqual(draws, ['rnd(30)', 'rn1(20,11)', 'rn2(3)']);
    assert.deepEqual(messages, [
        'The water is foul!  You gag and vomit.',
        'The fountain dries up!',
    ]);
    assert.equal(game.u.uhunger, hungerBefore - 20);
    assert.equal(game.multi, -2);
    assert.equal(game.multi_reason, 'vomiting');
    assert.equal(game.nomovemsg, 'You can move again.');
    assert.equal(location.typ, ROOM);
    assert.equal(location.horizontal, 0);
    assert.equal(location.flags, 0);
});

test('vomit keeps special eat.c paths fail-closed', async () => {
    await startedGame();
    const normal = game.youmonst.data;

    function stateFor(species, {
        altar = false,
        multi = 0,
        polymorphed = false,
        sick = false,
        uhs = 1,
    } = {}) {
        const uprops = Array.from(
            { length: SICK + 1 },
            () => ({ intrinsic: 0 }),
        );
        if (sick) uprops[SICK].intrinsic = 1;
        return {
            u: {
                umonnum: polymorphed ? species.pmidx : normal.pmidx,
                umonster: normal.pmidx,
                uhs,
                uprops,
                usick_type: sick ? SICK_VOMITABLE : 0,
                ux: 1,
                uy: 1,
            },
            youmonst: { data: species },
            level: { at: () => ({ typ: altar ? ALTAR : ROOM }) },
            multi,
        };
    }

    const cases = [
        ['polymorph', stateFor(game.mons[PM_ACID_BLOB], {
            polymorphed: true,
        })],
        ['cantvomit form', stateFor(game.mons[PM_SEWER_RAT])],
        ['sickness', stateFor(normal, { sick: true })],
        ['dry heave', stateFor(normal, { uhs: FAINTING })],
        ['existing multi-turn action', stateFor(normal, { multi: 1 })],
        ['acid breath', stateFor(game.mons[PM_YELLOW_DRAGON])],
        ['altar', stateFor(normal, { altar: true })],
        ['acidic form', stateFor(game.mons[PM_ACID_BLOB])],
    ];
    for (const [name, state] of cases) {
        // vomit() reaches nomul(-2) only after every refusal above it, so a
        // refused call leaves `multi` exactly as the case set it. The
        // baseline is captured before the call; an expectation derived from
        // the value under test would accept any write.
        const multiBefore = state.multi;
        assert.throws(() => vomit(state), UnsupportedEatError, name);
        assert.equal(state.multi, multiBefore, name);
    }
});
