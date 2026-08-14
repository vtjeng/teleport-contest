// dothrow.c throw_gold() driven end to end through js/jsmain.js runSegment(),
// over the same recipes scripts/run-throw-gold.mjs records against the C
// reference. The differential compares screens and random-number calls; this
// file asserts the game state behind those screens, so a change that keeps the
// screens and moves the coins, the hero or a turn fails here.
//
// The recipe assertions come first. They read the recipe rather than the
// recording, so a silent re-recording that stopped covering an arm of
// throw_gold() fails here instead of passing a differential against a weaker
// case.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    HELM_MOVES,
    PURSE,
    THROW_GOLD_CASES,
    loadThrowGoldHelmRecipe,
    loadThrowGoldRecipe,
} from './run-throw-gold.mjs';
import { COIN_CLASS, HELMET } from '../js/objects.js';
import { ZAP_POS } from '../js/const.js';
import { closed_door } from '../js/monmove.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { On_stairs } from '../js/stairs.js';

// cmd.c:2000 binds C('w') to the "wizwish" row. Spelled from its code point
// so no raw control character sits in this file.
const WISH = String.fromCharCode(0x17);

function segments() {
    return loadThrowGoldRecipe().segments;
}

// The one segment whose `label` in THROW_GOLD_CASES matches, so a test names
// the branch it exercises rather than an index.
function segmentFor(label) {
    const index = THROW_GOLD_CASES.findIndex((entry) => entry.label === label);
    assert.ok(index >= 0, `no case labelled ${label}`);
    return segments()[index];
}

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The floor pile at <x,y>, head first, as js/obj.js place_object() links it.
function pileAt(x, y) {
    const found = [];
    for (let obj = game.level.objects[x]?.[y]; obj; obj = obj.nexthere)
        found.push(obj);
    return found;
}

// How many animation frames each input boundary produced, which is the same
// per-step series scripts/diff-fresh.mjs compares against the C recording.
function framesPerStep(replay) {
    return replay.getAnimationFramesByStep().map((frames) => frames.length);
}

function purseInPack() {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.oclass === COIN_CLASS) return obj;
    return null;
}

// The size of each coin stack lying at <x,y>. Every case aims at one square,
// and mklev() has already scattered gold elsewhere on the level, so a
// level-wide count would measure the level rather than the throw.
function coinsAt(x, y) {
    return pileAt(x, y)
        .filter((obj) => obj.oclass === COIN_CLASS)
        .map((obj) => obj.quan);
}

test('the gold matrix separates seven arms of throw_gold()', () => {
    const recipe = loadThrowGoldRecipe();
    // Version 5 recipes contain replay inputs and no recorded C answers.
    assert.equal(recipe.version, 5);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    assert.deepEqual(THROW_GOLD_CASES.map(({ label }) => label), [
        'self', 'ceiling', 'stairs', 'floor', 'flight', 'wall', 'closed door',
    ]);
    assert.deepEqual(THROW_GOLD_CASES.map(({ moves }) => moves), [
        '.t$.', '.t$<', '.t$>', '.ht$>', '.t$l', '.t$j', '.yyyt$k',
    ]);
    // Every segment answers the object prompt with `$`, which is the whole
    // point: throw_obj() hands COIN_CLASS to throw_gold() and nothing else.
    assert.ok(THROW_GOLD_CASES.every(({ moves }) => moves.includes('t$')));
});

test('the helmet recipe is the one wizard-mode game', () => {
    const recipe = loadThrowGoldHelmRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    // cmd.c can_do_extcmd() reads playmode:debug before admitting the
    // WIZMODECMD "wizwish" row.
    assert.ok(recipe.segments[0].nethackrc.includes('playmode:debug'));
    assert.ok(segments().every(
        ({ nethackrc }) => !nethackrc.includes('playmode:debug'),
    ));
    // C('w'), then the wished object, then W over the slot the wish filled.
    assert.equal(HELM_MOVES, `.${WISH}helmet\nWlt$< .`);
});

test('every gold segment starts from the same hero and clock', () => {
    const all = [...segments(), ...loadThrowGoldHelmRecipe().segments];
    // A varying datetime would change moon phase and Friday-the-13th
    // behavior, neither of which this matrix is measuring.
    assert.ok(all.every(({ datetime }) => datetime === '20000110090000'));
    assert.ok(all.every(({ seed }) => seed === 6120001));
    // pettype:none is what keeps a pet out of the flight path; with one there
    // the `flight` segment would reach ghitm() instead of the floor.
    assert.ok(all.every(({ nethackrc }) => nethackrc.includes('pettype:none')));
    assert.ok(all.every(({ nethackrc }) => nethackrc.includes('role:Healer')));
});

test('the prompt offers the purse and the hero starts on the upstairs',
    async () => {
        const segment = segmentFor('self');
        await runSegment({ ...segment, moves: '.t' });
        // dothrow.c throw_ok():338-339 suggests COIN_CLASS, and the Healer
        // carries nothing else the prompt brackets.
        assert.equal(topLine(), 'What do you want to throw? [$ or ?*]');

        await runSegment({ ...segment, moves: '.' });
        assert.equal(purseInPack().quan, PURSE.normal);
        // The `stairs` segment's message depends on standing here.
        assert.ok(On_stairs(game.u.ux, game.u.uy, game));
    });

test('gold thrown at the hero stays in the pack and costs no turn',
    async () => {
        const segment = segmentFor('self');
        await runSegment({ ...segment, moves: '.' });
        const beforeMoves = game.moves;

        await runSegment({ ...segment, moves: segment.moves });
        // dothrow.c:2661-2668 returns ECMD_CANCEL, so no turn elapses.
        assert.equal(topLine(), 'You cannot throw gold at yourself.');
        assert.equal(purseInPack().quan, PURSE.normal);
        assert.deepEqual(coinsAt(game.u.ux, game.u.uy), []);
        assert.equal(game.moves, beforeMoves);
    });

test('gold thrown up falls back on the hero and lands underfoot',
    async () => {
        const segment = segmentFor('ceiling');
        await runSegment({ ...segment, moves: '.' });
        const beforeMoves = game.moves;
        const { ux, uy } = game.u;

        await runSegment({ ...segment, moves: segment.moves });
        assert.equal(
            topLine(),
            'The gold hits the ceiling, then falls back on top of your head.',
        );
        // dothrow.c:2692-2693 aims gb.bhitpos at the hero's own square, so the
        // whole purse lands there rather than flying.
        assert.equal(purseInPack(), null);
        assert.deepEqual(coinsAt(ux, uy), [PURSE.normal]);
        assert.equal(game.moves, beforeMoves + 1);
    });

test('gold thrown down names what it lands on', async () => {
    const onStairs = segmentFor('stairs');
    await runSegment({ ...onStairs, moves: onStairs.moves });
    // dothrow.c:2723-2724 calls surface(), and the hero has not left the
    // upstairs she started on.
    assert.ok(On_stairs(game.u.ux, game.u.uy, game));
    assert.equal(topLine(), 'The gold hits the stairs.');
    assert.deepEqual(coinsAt(game.u.ux, game.u.uy), [PURSE.normal]);

    const onFloor = segmentFor('floor');
    await runSegment({ ...onFloor, moves: onFloor.moves });
    // One step west is ordinary room floor, which is the other surface() arm.
    assert.ok(!On_stairs(game.u.ux, game.u.uy, game));
    assert.equal(topLine(), 'The gold hits the floor.');
    assert.deepEqual(coinsAt(game.u.ux, game.u.uy), [PURSE.normal]);
});

test('gold thrown east flies until the wall stops it', async () => {
    const segment = segmentFor('flight');
    await runSegment({ ...segment, moves: '.' });
    const beforeMoves = game.moves;
    const { ux, uy } = game.u;
    // ACURRSTR/2 - owt/40 at dothrow.c:2696 is 6 for a St:12 hero carrying
    // 1911 gold, which weighs (1911 + 50) / 100 = 19; the wall, not the
    // range, is what ends this flight.
    assert.ok(ZAP_POS(game.level.at(ux + 1, uy).typ));
    assert.ok(ZAP_POS(game.level.at(ux + 2, uy).typ));
    assert.ok(!ZAP_POS(game.level.at(ux + 3, uy).typ));
    // mklev() left no gold on the two squares the throw crosses.
    assert.deepEqual(coinsAt(ux + 1, uy), []);
    assert.deepEqual(coinsAt(ux + 2, uy), []);

    const replay = await runSegment({ ...segment, moves: segment.moves });
    // bhit() steps back off the wall square, so the coins land on the last
    // square they could enter.
    assert.equal(topLine(), '');
    assert.deepEqual(coinsAt(ux + 1, uy), []);
    assert.deepEqual(coinsAt(ux + 2, uy), [PURSE.normal]);
    assert.equal(game.moves, beforeMoves + 1);
    // bhit()'s tmp_at() flashes the missile along its path, so this is the one
    // gold case that animates. The count is what separates a throw that called
    // bhit() from one that skipped it, since both leave the coins on a square.
    assert.deepEqual(framesPerStep(replay), [0, 0, 0, 0, 2]);
});

test('a square gold cannot enter drops it at the hero\'s feet', async () => {
    const wall = segmentFor('wall');
    await runSegment({ ...wall, moves: '.' });
    const { ux, uy } = game.u;
    // dothrow.c:2702's first conjunct: the room's south wall.
    assert.ok(!ZAP_POS(game.level.at(ux, uy + 1).typ));

    const wallReplay = await runSegment({ ...wall, moves: wall.moves });
    assert.equal(topLine(), '');
    assert.deepEqual(coinsAt(ux, uy), [PURSE.normal]);
    // No frame at all: dothrow.c:2703-2704 puts the coins down without
    // calling bhit(). bhit() would land them on this same square after
    // stepping back off the wall, so the animation is the only difference.
    assert.deepEqual(framesPerStep(wallReplay), [0, 0, 0, 0, 0]);

    const door = segmentFor('closed door');
    await runSegment({ ...door, moves: '.yyy' });
    const doorx = game.u.ux;
    const doory = game.u.uy - 1;
    // dothrow.c:2702's second conjunct, reached only because the first one
    // passes: a closed door is a square ZAP_POS() accepts.
    assert.ok(ZAP_POS(game.level.at(doorx, doory).typ));
    assert.ok(closed_door(doorx, doory, game));

    const doorReplay = await runSegment({ ...door, moves: door.moves });
    assert.equal(topLine(), '');
    assert.deepEqual(coinsAt(game.u.ux, game.u.uy), [PURSE.normal]);
    assert.deepEqual(framesPerStep(doorReplay), [0, 0, 0, 0, 0, 0, 0, 0]);
});

test('a worn helmet adds a second line to the ceiling message', async () => {
    const segment = loadThrowGoldHelmRecipe().segments[0];
    await runSegment({ ...segment, moves: `.${WISH}helmet\nWl` });
    assert.equal(game.uarmh.otyp, HELMET);
    assert.equal(purseInPack().quan, PURSE.debug);

    // The first line raises a --More--, which the space in HELM_MOVES clears.
    await runSegment({ ...segment, moves: `.${WISH}helmet\nWlt$<` });
    assert.equal(
        topLine(),
        'The gold hits the ceiling, then falls back on top of your '
        + 'head.--More--',
    );

    await runSegment({ ...segment, moves: segment.moves });
    // dothrow.c:2688-2690 names the helmet with objnam.c helm_simple_name(),
    // which answers "helm" for an unidentified HELMET rather than "helmet".
    assert.equal(topLine(), '');
    await runSegment({ ...segment, moves: `.${WISH}helmet\nWlt$< ` });
    assert.equal(topLine(), 'Fortunately, you are wearing a helm!');
    assert.deepEqual(coinsAt(game.u.ux, game.u.uy), [PURSE.debug]);
});
