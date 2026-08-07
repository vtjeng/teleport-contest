// Focused tests for sounds.c dotalk()/dochat() and the three helpers it needs:
// mondata.h is_silent(), display.h vobj_at() and shk.c shop_object().
//
// The recorded evidence is the twelve-segment matrix in
// scripts/run-chat-command.mjs, which compares complete screens, cursors and
// random-number calls against fresh C recordings for every arm a fresh case
// can reach. The first group of tests below replays that matrix through the
// port, so the messages it recorded stay pinned without a C recorder.
//
// The rest cover what no C case can reach: the four speech guards, each of
// which needs a hero who is polymorphed, strangled, swallowed or submerged;
// the shop quote, which needs the hero standing on a shop's stock; and the
// monster arm, which stops rather than continuing into domonnoise().

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    ECMD_OK,
    HALLUC,
    SHOPBASE,
    STRANGLED,
} from '../js/const.js';
import { UnsupportedHeroCommandBoundaryError } from '../js/cmd.js';
import { vobj_at } from '../js/display.js';
import { rndmonnam } from '../js/do_name.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { is_silent } from '../js/mondata.js';
import * as M from '../js/monsters.js';
import { COIN_CLASS } from '../js/objects.js';
import { getRngLog } from '../js/rng.js';
import { in_rooms } from '../js/rooms.js';
import { shop_keeper, shop_object } from '../js/shk.js';
import { UnsupportedChatError, dotalk } from '../js/sounds.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    RIDE_COMMAND,
    loadRideDismountRecipe,
} from './run-ride-dismount.mjs';
import { loadShopFloorPricingRecipe } from './run-shop-floor-pricing.mjs';
import {
    CANCEL_CASES,
    CONDUCT_CASES,
    STATUE_CASES,
    TARGET_CASES,
    loadChatCancelRecipe,
    loadChatConductRecipe,
    loadChatStatueRecipe,
    loadChatTargetRecipe,
    verifyChatCommandSegment,
} from './run-chat-command.mjs';

const RECIPES = [
    loadChatTargetRecipe,
    loadChatConductRecipe,
    loadChatStatueRecipe,
    loadChatCancelRecipe,
];

// gt.toplines, which pline.c writes whether or not the row has been repainted.
function toplines(state) {
    return state._ttyToplines ?? '';
}

// Drop the current message so the next pline() starts a fresh top line rather
// than asking for --More--, which no keystroke is left to answer.
function quiet(state) {
    clearTtyMessageWindow(state);
    state._ttyToplines = '';
}

// Replay the first #chat segment's leading wait and hand back the live state,
// which is a Valkyrie standing in an ordinary D:1 room. Every guard below
// returns before getdir(), so dotalk() can be called on that state directly.
async function chatterOnTurnOne() {
    const [segment] = loadChatTargetRecipe().segments;
    await runSegment({ ...segment, moves: '.' });
    quiet(game);
    return game;
}

test('the #chat matrix keeps replay inputs only', () => {
    for (const load of RECIPES) {
        const recipe = load();
        // Version 5 recipes contain replay inputs and no recorded C answers.
        assert.equal(recipe.version, 5);
        assert.ok(recipe.segments.every(
            (segment) => !Object.hasOwn(segment, 'steps'),
        ));
        // Every segment issues the command through the extended-command
        // prompt and waits afterwards, so a move wrongly spent by an arm C
        // returns ECMD_OK from shifts a compared screen.
        assert.ok(recipe.segments.every(
            ({ moves }) => /^\.#chat\n.\.\.$/su.test(moves),
        ));
    }
});

test('the #chat matrix answers the prompt a different way every time', () => {
    // The direction key is the only input that varies inside a group, so two
    // cases that typed the same key under the same rc would be one case
    // recorded twice.
    const typed = RECIPES.flatMap(
        (load) => load().segments.map(
            ({ seed, nethackrc, moves }) => `${seed}|${nethackrc}|${moves}`,
        ),
    );
    assert.equal(new Set(typed).size, typed.length);
    assert.equal(typed.length, 12);
});

test('every #chat case cites the sounds.c line that opens its arm', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/src/sounds.c', import.meta.url), 'utf8',
    ).split('\n');
    const cases = [
        ...TARGET_CASES, ...CONDUCT_CASES, ...STATUE_CASES, ...CANCEL_CASES,
    ];
    for (const { arm } of cases) {
        const match = /^sounds\.c:(\d+) (\S+)/u.exec(arm);
        assert.ok(match, `"${arm}" is not "sounds.c:<line> <token>"`);
        // split('\n') is zero-based and C line numbers are one-based.
        const line = source[Number(match[1]) - 1];
        // The label quotes a fragment of the cited line verbatim, so a label
        // that slipped by a line lands on a comment, a blank line or some
        // other arm's condition and fails here.
        assert.ok(line.includes(match[2]),
            `sounds.c:${match[1]} does not contain ${match[2]}`);
    }
});

test('every #chat case reaches the arm it was chosen for and says its line',
    async () => {
        for (const load of RECIPES) {
            for (const segment of load().segments)
                await verifyChatCommandSegment(segment);
        }
    });

test('is_silent answers the species msound', () => {
    const catalog = {};
    M.monst_globals_init(catalog);
    // monsters.h:137 gives the acid blob SIZ(..., MS_SILENT, ...), the zero
    // member of monflag.h's enum, and monsters.h:199 gives the jackal
    // MS_BARK, which is 1. is_silent() is an equality test against MS_SILENT,
    // so only the first of the two is silent.
    assert.equal(catalog.mons[M.PM_ACID_BLOB].msound, 0);
    assert.equal(is_silent(catalog.mons[M.PM_ACID_BLOB]), true);
    assert.equal(catalog.mons[M.PM_JACKAL].msound, 1);
    assert.equal(is_silent(catalog.mons[M.PM_JACKAL]), false);
    // monsters.h:3452 gives the wizard role monster MS_HUMANOID, which is 25.
    // An unpolymorphed hero's youmonst.data is her role monster, which is why
    // no ordinary hero takes the guard at sounds.c:1261.
    assert.equal(catalog.mons[M.PM_WIZARD].msound, 25);
    assert.equal(is_silent(catalog.mons[M.PM_WIZARD]), false);
});

test('vobj_at answers the head of the floor pile', async () => {
    const state = await chatterOnTurnOne();
    // Seed 4410002 leaves one wand of digging one square east of the start
    // and bare floor one square west; scripts/run-chat-command.mjs replays
    // both squares against C.
    const east = vobj_at(state.u.ux + 1, state.u.uy, state);
    assert.ok(east, 'the case seed lost its floor object');
    assert.equal(east.nexthere, null);
    assert.equal(vobj_at(state.u.ux - 1, state.u.uy, state), null);

    // display.h:22 reads the pile head and applies no visibility test, so a
    // second object added under the first stays hidden from it.
    const buried = { oclass: east.oclass, otyp: east.otyp, nexthere: null };
    east.nexthere = buried;
    assert.equal(vobj_at(state.u.ux + 1, state.u.uy, state), east);
});

// sounds.c:1355-1362, transcribed from the C array in its own order. The
// matrix behind this file has no hallucination case -- hallucination is not an
// rc conduct -- so nothing else checks the table, the bound, or the clamp.
const WALL_REPLIES = [
    'gripes about its job.',
    'tells you a funny joke!',
    'insults your heritage!',
    'chuckles.',
    'guffaws merrily!',
    'deprecates your exploration efforts.',
    'suggests a stint of rehab...',
    "doesn't seem to be interested.",
];

test('a hallucinating hero hears the wall out of an eight-row table',
    async () => {
        const state = await chatterOnTurnOne();
        state.u.uprops[HALLUC].intrinsic = 1;
        const rolled = new Set();
        // Enough repeats that every value of rn2(10) turns up; the seed is
        // fixed, so the coverage assertion below either holds or does not.
        // #chat costs no move, so the same square answers every time.
        for (let attempt = 0; attempt < 80; attempt++) {
            quiet(state);
            // 'y' is northwest, the room corner the recorded matrix uses for
            // its sighted wall case.
            state.nhDisplay.pushKey('y'.charCodeAt(0));
            const before = getRngLog().length;
            assert.equal(await dotalk(state), ECMD_OK);

            // sounds.c:1364. The reply is the arm's only draw, and its bound
            // is what decides how often the clamp fires.
            const drawn = getRngLog().slice(before);
            assert.equal(drawn.length, 1, `attempt ${attempt}`);
            const [call, result] = drawn[0].split('=');
            assert.equal(call, 'rn2(10)', `attempt ${attempt}`);
            const roll = Number(result);
            rolled.add(roll);

            // sounds.c:1365-1366 clamps a roll past the end onto the last
            // row, so rolls 7, 8 and 9 all say the same thing.
            assert.equal(
                toplines(state),
                `The wall ${WALL_REPLIES[Math.min(roll, 7)]}`,
                `roll ${roll}`,
            );
        }
        // Every row of the table and all three clamped rolls were reached.
        assert.deepEqual([...rolled].sort((a, b) => a - b),
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

// sounds.c:1336-1339. The statue arm's second draw site: a hallucinating hero
// cannot tell what she is looking at, so the line names a random monster
// instead. rndmonnam() draws on the display stream, which the recorder's core
// log does not carry, so only the printed line shows it happened.
test('a hallucinating hero cannot tell a statue from a monster', async () => {
    const [segment] = loadChatStatueRecipe().segments;

    // The same start twice. The first run reads the name the display stream
    // is about to produce; the second lets dochat() draw it, so the assertion
    // names no observed string of its own.
    await runSegment({ ...segment, moves: '.' });
    const expected = rndmonnam({ state: game });

    const state = await (async () => {
        await runSegment({ ...segment, moves: '.' });
        quiet(game);
        return game;
    })();
    state.u.uprops[HALLUC].intrinsic = 1;
    // 'u' is northeast, the square the statue recipe puts its statue on.
    state.nhDisplay.pushKey('u'.charCodeAt(0));
    assert.equal(await dotalk(state), ECMD_OK);
    assert.notEqual(toplines(state), 'The statue seems not to notice you.');
    assert.equal(toplines(state), `The ${expected} seems not to notice you.`);
});

test('a swallowed hero cannot be heard outside', async () => {
    const state = await chatterOnTurnOne();
    state.u.uswallow = 1;
    // sounds.c:1269-1272.
    assert.equal(await dotalk(state), ECMD_OK);
    assert.equal(toplines(state), "They won't hear you out there.");
});

test('an underwater hero is unintelligible', async () => {
    const state = await chatterOnTurnOne();
    // youprop.h:279 defines Underwater as u.uinwater alone.
    state.u.uinwater = 1;
    // sounds.c:1273-1276, whose Your() prefix pline.c:377 spells "Your ".
    assert.equal(await dotalk(state), ECMD_OK);
    assert.equal(toplines(state),
        'Your speech is unintelligible underwater.');
});

test('a strangled hero is choking, not talking', async () => {
    const state = await chatterOnTurnOne();
    // youprop.h:110 defines Strangled as the intrinsic alone.
    state.u.uprops[STRANGLED].intrinsic = 1;
    // sounds.c:1265-1268, whose You_cant() prefix pline.c:406 spells
    // "You can't ". The two spaces after the period are C's.
    assert.equal(await dotalk(state), ECMD_OK);
    assert.equal(toplines(state), "You can't speak.  You're choking!");
});

test('a silent form cannot speak at all', async () => {
    const state = await chatterOnTurnOne();
    // polyself.c writes youmonst.data; sounds.c:1261 reads it through
    // mondata.h is_silent(). An acid blob is the guard's own case: it makes
    // no sound, so the arm runs before Strangled is even consulted.
    state.youmonst.data = state.mons[M.PM_ACID_BLOB];
    state.u.uprops[STRANGLED].intrinsic = 1;
    // sounds.c:1261-1264. do_name.c pmname() falls back to the neutral name
    // because monsters.h gives the acid blob no gendered ones, and
    // objnam.c an() prefixes "an" before a vowel.
    assert.equal(await dotalk(state), ECMD_OK);
    assert.equal(toplines(state), 'As an acid blob, you cannot speak.');
});

test('chatting on a shop square asks for price_quote()', async () => {
    // The shop matrix walks a wizard onto one stock potion of a D:5 potion
    // shop; scripts/run-shop-floor-pricing.mjs compares that walk with C.
    const [segment] = loadShopFloorPricingRecipe().segments;
    let boundary = null;
    await runSegment(segment, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, null);
    const state = game;
    quiet(state);

    const stock = shop_object(state.u.ux, state.u.uy, state);
    assert.ok(stock, 'the hero is not standing on shop merchandise');
    assert.equal(stock, vobj_at(state.u.ux, state.u.uy, state));

    // sounds.c:1279-1290 hands that object to price_quote(), which this goal
    // leaves unported, so the command stops instead of quoting.
    await assert.rejects(
        () => dotalk(state),
        (error) => error instanceof UnsupportedChatError
            && /price_quote/u.test(error.message),
    );
});

test('shop_object skips gold and needs a willing shopkeeper', async () => {
    const [segment] = loadShopFloorPricingRecipe().segments;
    await runSegment(segment);
    const state = game;
    const { ux, uy } = state.u;
    const stock = shop_object(ux, uy, state);
    assert.ok(stock);

    // shk.c:5397-5399 walks past every COIN_CLASS object, so gold lying on
    // top of the stock does not turn the quote into a quote for the gold.
    const gold = { oclass: COIN_CLASS, otyp: stock.otyp, nexthere: stock };
    state.level.objects[ux][uy] = gold;
    assert.equal(shop_object(ux, uy, state), stock);
    // A square holding nothing but gold leaves otmp null, which shk.c:5400
    // answers 0 for.
    gold.nexthere = null;
    assert.equal(shop_object(ux, uy, state), null);
    state.level.objects[ux][uy] = stock;

    const shkp = shop_keeper(in_rooms(ux, uy, SHOPBASE, state)[0] ?? 0, state);
    assert.ok(shkp, 'the shop has no resident');
    // shk.c:54 NOTANGRY(): an angry shopkeeper quotes nothing.
    shkp.mpeaceful = 0;
    assert.equal(shop_object(ux, uy, state), null);
    shkp.mpeaceful = 1;
    assert.equal(shop_object(ux, uy, state), stock);

    // shk.c:58 muteshk() over monst.h:251 helpless(): asleep or immobile
    // shopkeepers are mute.
    shkp.msleeping = 1;
    assert.equal(shop_object(ux, uy, state), null);
    shkp.msleeping = 0;
    shkp.mcanmove = 0;
    assert.equal(shop_object(ux, uy, state), null);
    shkp.mcanmove = 1;
    assert.equal(shop_object(ux, uy, state), stock);

    // The rest of muteshk() is `msound <= MS_ANIMAL`, so the boundary sits
    // between MS_ANIMAL (17, monflag.h:29, the last animal noise) and 18. The
    // species record is frozen, so the case swaps in a copy of it.
    const speaks = shkp.data;
    shkp.data = { ...speaks, msound: 17 };
    assert.equal(shop_object(ux, uy, state), null);
    shkp.data = { ...speaks, msound: 18 };
    assert.equal(shop_object(ux, uy, state), stock);
    shkp.data = speaks;

    // shk.c:5390-5392's early return has no case of its own here, and cannot
    // have one: costly_spot() at :5400 calls shop_keeper() and inhishop() over
    // the same square and the same resident, so it answers false for every
    // state the early return catches. C keeps the pair as a fast path, and the
    // port keeps it for the same reason.
});

test('a mounted hero chats past the steed arm unless she aims down',
    async () => {
        // steed.c mount_steed()'s success path, replayed from the matrix that
        // records it against C. Its moves are a wait, #ride, the direction of
        // the saddled pony, then a second #ride that dismounts again; this
        // test keeps the mount and replaces the dismount with #chat.
        const [ride] = loadRideDismountRecipe().segments;
        const toPony = ride.moves.split(RIDE_COMMAND)[1];
        const mounted = (chatDir) => ({
            ...ride,
            moves: `.${RIDE_COMMAND}${toPony}#chat\n${chatDir}`,
        });

        // sounds.c:1297 is `u.usteed && u.dz > 0`, so a rider who answers the
        // prompt with the self key has u.dz at 0 and reaches the self arm at
        // :1310 exactly as an unmounted hero does. This is the case that
        // separates `> 0` from `>= 0`.
        let boundary = null;
        await runSegment(mounted('.'),
            { onBoundary: (error) => { boundary = error; } });
        assert.ok(game.u.usteed, 'the hero did not mount');
        assert.equal(boundary, null);
        assert.equal(toplines(game),
            'Talking to yourself is a bad habit for a dungeoneer.');

        // Aiming down at the steed continues into domonnoise() at :1302,
        // which this goal leaves unported.
        await runSegment(mounted('>'),
            { onBoundary: (error) => { boundary = error; } });
        assert.ok(boundary instanceof UnsupportedHeroCommandBoundaryError);
        assert.match(boundary.message, /a chat aimed down at a steed/u);
    });

test('chatting at a monster stops at domonnoise()', async () => {
    // The pet starts beside the hero, so this is the shortest input sequence
    // that puts a monster on the target square. Its own start is one seed
    // over from the matrix's, which has no pet.
    let boundary = null;
    await runSegment({
        seed: 4410002,
        datetime: '20310203040506',
        nethackrc: [
            'OPTIONS=name:Chatter,role:Valkyrie,race:human,gender:female,'
            + 'align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=!acoustics',
            '',
        ].join('\n'),
        moves: '#chat\n',
    }, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, null, 'the start alone must not stop');

    const pet = [...findPets(game)];
    assert.equal(pet.length, 1, 'the start did not place exactly one pet');
    const dx = pet[0].mx - game.u.ux;
    const dy = pet[0].my - game.u.uy;
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1,
        'the pet did not start beside the hero');

    // cmd.c commands_init() binds these eight keys to the eight directions
    // while number_pad is off.
    const key = 'ykuh.lbjn'[(dy + 1) * 3 + (dx + 1)];
    await runSegment({
        seed: 4410002,
        datetime: '20310203040506',
        nethackrc: [
            'OPTIONS=name:Chatter,role:Valkyrie,race:human,gender:female,'
            + 'align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen',
            'OPTIONS=!acoustics',
            '',
        ].join('\n'),
        moves: `#chat\n${key}`,
    }, { onBoundary: (error) => { boundary = error; } });
    // sounds.c:1374-1377 lets a detected monster through to the naming arms
    // and finally to domonnoise() at :1408, none of which this goal ports.
    assert.ok(boundary instanceof UnsupportedHeroCommandBoundaryError);
    assert.match(boundary.message, /a monster occupying the target square/u);
});

function* findPets(state) {
    for (let mon = state.level.monlist; mon; mon = mon.nmon)
        if (mon.mtame) yield mon;
}
