import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    DEAF,
    DRAWBRIDGE_DOWN,
    ECMD_OK,
    ECMD_TIME,
    FOUNTAIN,
    GRAVE,
    ICE,
    LADDER,
    LAVAPOOL,
    LEVITATION,
    MOAT,
    OBJ_FLOOR,
    PIT,
    ROOM,
    ROOMOFFSET,
    SHOPBASE,
    SINK,
    STAIRS,
    THRONE,
    TT_LAVA,
    TT_PIT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { delobj, useupf } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { UnsupportedHideError, maybe_unhide_at } from '../js/mon.js';
import { eggs_in_water, lays_eggs } from '../js/mondata.js';
import { newMonster } from '../js/monst.js';
import {
    AT_HUGS,
    M1_AMORPHOUS,
    M1_CONCEAL,
    M1_HIDE,
    M1_HUMANOID,
    M1_OVIPAROUS,
    M1_SLITHY,
    M1_SWIM,
    PM_ACID_BLOB,
    PM_GREMLIN,
    PM_LICHEN,
    PM_TRAPPER,
    S_DRAGON,
    S_EEL,
} from '../js/monsters.js';
import { mksobj_at, remove_object } from '../js/obj.js';
import { objectGenerationEnv } from '../js/object_generation.js';
import {
    CORPSE,
    CREAM_PIE,
    FOOD_RATION,
    GOLD_PIECE,
    LARGE_BOX,
    SACK,
    TOWEL,
} from '../js/objects.js';
import { UnsupportedShopError } from '../js/shk.js';
import { UnsupportedSitError, dosit } from '../js/sit.js';
import {
    SIT,
    WAIT,
    loadSitCommandDebugRecipes,
    loadSitCommandRecipe,
} from './run-sit-command.mjs';

// gt.toplines, which pline.c writes whether or not the row was repainted. A
// dosit() called outside moveloop_core() leaves its line here.
function toplines() {
    return game._ttyToplines ?? '';
}

// The painted top row, which only a command driven through moveloop_core()
// reaches.
function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// Locate a matrix segment by the seed and the keys it types, so reordering the
// matrix cannot silently point a test at a different case.
function segmentFor(seed, moves) {
    const found = loadSitCommandRecipe().segments.find(
        (segment) => segment.seed === seed && segment.moves === `${moves}${WAIT}`,
    );
    assert.ok(found, `the matrix contains seed ${seed} typing ${moves}`);
    return found;
}

// Replay the walk in front of one matrix segment and stop there, so the hero
// stands where its #sit starts from. The caller then calls dosit() directly.
async function standOn(seed, moves, walk) {
    await runSegment({ ...segmentFor(seed, moves), moves: walk });
    game._ttyToplines = '';
}

// The staircase the Rogue of seed 4404011 starts on, which every constructed
// case below rewrites to the terrain it needs. The wait is what dismisses the
// welcome line, so the next pline() has a clear top line to write on.
async function standOnStairs() {
    await standOn(4404011, SIT, WAIT);
    assert.equal(game.level.at(game.u.ux, game.u.uy).typ, STAIRS);
}

// One step east of that staircase, which the second matrix segment walks: the
// hero stands on plain room floor, and dungeon.c On_stairs() no longer answers
// for her square.
async function standOnFloor() {
    await standOn(4404011, `l${SIT}`, `${WAIT}l`);
    assert.equal(heroSquare().typ, ROOM);
}

function heroSquare() {
    return game.level.at(game.u.ux, game.u.uy);
}

function putObject(otyp, overrides = {}) {
    const obj = mksobj_at(
        otyp,
        game.u.ux,
        game.u.uy,
        true,
        false,
        objectGenerationEnv({ state: game }),
    );
    Object.assign(obj, overrides);
    return obj;
}

// Turn the room the hero stands in into a tended shop, which is what
// shk.c costly_spot() needs to answer TRUE for her square. The shopkeeper
// stands in a corner of the same room, because inhishop() reads its position
// and costly_spot() excludes its own square.
function makeHeroRoomAShop() {
    const roomno = heroSquare().roomno;
    assert.ok(roomno >= ROOMOFFSET, 'the hero stands in a room');
    const room = game.level.rooms[roomno - ROOMOFFSET];
    room.rtype = SHOPBASE;
    game.level.flags.has_shop = 1;
    const shk = newMonster({
        mx: room.lx, my: room.ly, isshk: 1, data: species(),
    });
    shk.mextra = {
        eshk: { shoproom: roomno, shoplevel: game.u.uz, shk: { x: room.lx, y: room.ly } },
    };
    room.resident = shk;
    return shk;
}

// A species record shaped like mons[] but owned by the test, so a flag it sets
// cannot leak into the shared monster table.
function species(overrides = {}) {
    return {
        pmnames: ['thing', 'thing', 'thing'],
        mlet: 0,
        mflags1: 0,
        mflags2: 0,
        mflags3: 0,
        msize: 2,
        mattk: [],
        mmove: 0,
        ...overrides,
    };
}

test('the matrix holds replay inputs only', () => {
    const recipes = [
        loadSitCommandRecipe(),
        ...loadSitCommandDebugRecipes(),
    ];
    for (const recipe of recipes) {
        for (const segment of recipe.segments) {
            assert.ok(!('steps' in segment));
            assert.match(segment.nethackrc, /OPTIONS=name:Sitter,/u);
            assert.ok(segment.moves.endsWith(WAIT)
                || segment.moves.endsWith(`${SIT}:${WAIT}`));
        }
    }
    // record-session.mjs keeps one install per recipe, and a debug game leaves
    // a save behind, so each debug segment must travel alone.
    for (const recipe of loadSitCommandDebugRecipes())
        assert.equal(recipe.segments.length, 1);
});

test('sitting on the stairs spends the turn', async () => {
    // sit.c:535-536 through the sit_message format at :402.
    await standOnStairs();
    const before = game.moves;
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(toplines(), 'You sit on the stairs.');
    // dosit() answers ECMD_TIME; rhack() is what spends the turn, so the
    // counter itself must not have moved inside the command.
    assert.equal(game.moves, before);
});

test('the extended-command prompt dispatches #sit and spends its turn',
    async () => {
    // cmd.c doextcmd()'s switch, the seam this slice opened: the '#sit' row
    // was already in extcmdlist[], so only the case that calls dosit() stood
    // between the prompt and the command. The turn counter moving is what
    // shows rhack() received ECMD_TIME rather than ECMD_OK.
    const stairs = segmentFor(4404011, SIT);
    await runSegment({ ...stairs, moves: WAIT });
    const before = game.moves;
    await runSegment({ ...stairs, moves: `${WAIT}${SIT}` });
    assert.equal(topLine(), 'You sit on the stairs.');
    assert.equal(game.moves, before + 1);
});

test('the terrain chain reaches its arms in source order', async () => {
    // sit.c:505-563. Each entry is the square typ that selects one arm and the
    // reason it stops, in the order the else-if chain tests them. Every arm
    // must throw at its own condition, before it prints or changes anything.
    const refused = [
        [SINK, "dosit()'s sink arm"],
        [ALTAR, "dosit()'s altar arm"],
        [GRAVE, "dosit()'s grave arm"],
        [LADDER, "dosit()'s ladder arm"],
        [LAVAPOOL, "dosit()'s lava arm"],
        [ICE, "dosit()'s ice arm"],
        [DRAWBRIDGE_DOWN, "dosit()'s drawbridge arm"],
        [THRONE, "dosit()'s throne arm"],
    ];
    for (const [typ, reason] of refused) {
        await standOnStairs();
        heroSquare().typ = typ;
        await assert.rejects(
            () => dosit(game),
            (error) => error instanceof UnsupportedSitError
                && error.message.endsWith(reason),
            `typ ${typ}`,
        );
        assert.equal(toplines(), '', `typ ${typ} printed before stopping`);
    }
});

test('water stops the command at the guard rather than in_water', async () => {
    // sit.c:430-431. `goto in_water` lands on :511-525, which calls
    // split_mon(), dryup() and water_damage() over two rn2(10) draws. The
    // guard is above every other arm, so refusing there is what keeps a
    // water-walking hero from reaching the object arm below it.
    await standOnStairs();
    heroSquare().typ = MOAT;
    await assert.rejects(
        () => dosit(game),
        (error) => error instanceof UnsupportedSitError
            && error.message.endsWith("dosit()'s water-walking jump to in_water"),
    );
    assert.equal(toplines(), '');
});

test('the gremlin guard reads Upolyd, the species and the square', async () => {
    // sit.c:432-434. js/u_init.js writes u.umonnum === u.umonster, so Upolyd()
    // is false in every game this port plays and no recording can reach this
    // arm; the three terms are pinned from source instead.
    await standOnStairs();
    heroSquare().typ = FOUNTAIN;
    // Upolyd is false while umonnum matches umonster, so the fountain alone
    // leaves the guard shut and the chain runs on to the final else, where
    // dungeon.c surface() names the fountain.
    game.u.umonnum = game.u.umonster;
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(toplines(), 'Having fun sitting on the fountain?');

    await standOnStairs();
    heroSquare().typ = FOUNTAIN;
    game.u.umonnum = PM_GREMLIN;
    await assert.rejects(
        () => dosit(game),
        (error) => error instanceof UnsupportedSitError
            && error.message.endsWith("dosit()'s gremlin jump to in_water"),
    );
});

test('an underwater hero stops before the muddy bottom', async () => {
    // sit.c:505-509, whose second term is mondata.h eggs_in_water().
    await standOnStairs();
    game.u.uinwater = 1;
    await assert.rejects(
        () => dosit(game),
        (error) => error instanceof UnsupportedSitError
            && error.message.endsWith("dosit()'s underwater arm"),
    );
    game.u.uinwater = 0;
});

test('an egg-laying hero stops before lay_an_egg()', async () => {
    // sit.c:559-560. No role's species carries M1_OVIPAROUS, so this arm is
    // reachable only after a polymorph the port cannot perform.
    await standOnStairs();
    heroSquare().typ = ROOM;
    game.youmonst.data = species({ mflags1: M1_OVIPAROUS });
    await assert.rejects(
        () => dosit(game),
        (error) => error instanceof UnsupportedSitError
            && error.message.endsWith("dosit()'s egg-laying arm"),
    );
});

test('lays_eggs and eggs_in_water read the flags mondata.h names', () => {
    // mondata.h:77-79. eggs_in_water() needs all three terms, and only an
    // S_EEL swimmer that lays eggs has them.
    assert.equal(lays_eggs(species({ mflags1: M1_OVIPAROUS })), true);
    assert.equal(lays_eggs(species({ mflags1: 0 })), false);
    assert.equal(eggs_in_water(species({
        mflags1: M1_OVIPAROUS | M1_SWIM, mlet: S_EEL,
    })), true);
    // Each of the three terms alone is not enough.
    assert.equal(eggs_in_water(species({
        mflags1: M1_SWIM, mlet: S_EEL,
    })), false);
    assert.equal(eggs_in_water(species({
        mflags1: M1_OVIPAROUS | M1_SWIM, mlet: S_DRAGON,
    })), false);
    assert.equal(eggs_in_water(species({
        mflags1: M1_OVIPAROUS, mlet: S_EEL,
    })), false);
});

test('a hero who cannot reach the floor gets one of three lines', async () => {
    // sit.c:414-421. All three return ECMD_OK, and none is reachable in a
    // recording: no ported path engulfs the hero, no ported command grants
    // levitation, and the steed guard above returns before a rider's low
    // riding skill can answer the third.
    await standOnStairs();
    game.u.uswallow = 1;
    assert.equal(await dosit(game), ECMD_OK);
    assert.equal(toplines(), 'There are no seats in here!');
    game.u.uswallow = 0;

    await standOnStairs();
    game.u.uprops[LEVITATION].intrinsic = 1;
    assert.equal(await dosit(game), ECMD_OK);
    assert.equal(toplines(), 'You tumble in place.');
    game.u.uprops[LEVITATION].intrinsic = 0;

    await standOnStairs();
    // engrave.c can_reach_floor()'s remaining FALSE arm: a holder whose
    // species has an AT_HUGS attack.
    game.u.ustuck = newMonster({
        data: species({ mattk: [{ aatyp: AT_HUGS }] }),
    });
    assert.equal(await dosit(game), ECMD_OK);
    assert.equal(toplines(), 'You are sitting on air.');
    game.u.ustuck = null;
});

test('a holder that is not hugging the hero offers no lap', async () => {
    // sit.c:422-429. can_reach_floor() answers TRUE for a holder without
    // AT_HUGS, so this arm is what meets a hero held by, say, an eel.
    await standOnStairs();
    game.u.ustuck = newMonster({
        data: species({ pmnames: ['eel', 'eel', 'eel'] }),
    });
    assert.equal(await dosit(game), ECMD_OK);
    assert.equal(toplines(), 'The eel has no lap.');

    await standOnStairs();
    // mhis() is you.h:324 over pronoun_gender(), neither of which is ported,
    // so the humanoid half stops instead of printing.
    game.u.ustuck = newMonster({
        data: species({
            pmnames: ['gnome', 'gnome', 'gnome'],
            mflags1: M1_HUMANOID,
        }),
    });
    await assert.rejects(
        () => dosit(game),
        (error) => error instanceof UnsupportedSitError
            && error.message.includes('mhis()'),
    );
    game.u.ustuck = null;
});

test('the hider write runs after the steed guard and before the rest',
    async () => {
    // sit.c:410-412. The write sits below the steed guard's return and above
    // every other arm, including the two that return ECMD_OK without sitting.
    await standOnStairs();
    game.youmonst.data = species({ mflags1: M1_HIDE });
    game.u.uundetected = 1;
    game.u.uswallow = 1;
    assert.equal(await dosit(game), ECMD_OK);
    assert.equal(game.u.uundetected, 0);
    game.u.uswallow = 0;

    await standOnStairs();
    game.youmonst.data = species({ mflags1: M1_HIDE });
    game.u.uundetected = 1;
    game.u.usteed = newMonster({ data: species({ pmnames: ['pony', 'pony', 'pony'] }) });
    assert.equal(await dosit(game), ECMD_OK);
    assert.equal(toplines(), 'You are already sitting on the pony.');
    // The steed guard returned above the write, so the hero is still hidden.
    assert.equal(game.u.uundetected, 1);
    game.u.usteed = null;

    await standOnStairs();
    // "trapper can stay hidden on floor": the third term spares PM_TRAPPER.
    game.youmonst.data = species({ mflags1: M1_HIDE });
    game.u.uundetected = 1;
    game.u.umonnum = PM_TRAPPER;
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(game.u.uundetected, 1);
});

test('a coin pile under a dragon reads the hoard against the hero level',
    async () => {
    // sit.c:441-446. Reachable only after a polymorph into a dragon, which
    // this port cannot perform; the arithmetic is pinned from source.
    await standOnStairs();
    game.youmonst.data = species({ mlet: S_DRAGON });
    game.u.ulevel = 1;
    putObject(GOLD_PIECE, { quan: 999 });
    assert.equal(await dosit(game), ECMD_TIME);
    // 999 + 0 carried < 1 * 1000, so the hoard is meager.
    assert.equal(toplines(), 'You coil up around your meager hoard.');

    await standOnStairs();
    game.youmonst.data = species({ mlet: S_DRAGON });
    game.u.ulevel = 1;
    putObject(GOLD_PIECE, { quan: 1000 });
    assert.equal(await dosit(game), ECMD_TIME);
    // 1000 is not less than 1000, so the adjective drops out.
    assert.equal(toplines(), 'You coil up around your hoard.');
});

test('a slithy hero coils around the object instead of sitting on it',
    async () => {
    // sit.c:453-457. Only a polymorphed hero is slithy, so the two lines can
    // differ only in a game this port cannot yet play.
    await standOnStairs();
    putObject(FOOD_RATION);
    game.youmonst.data = species({ mflags1: M1_SLITHY });
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(
        toplines(),
        "You coil up around the food ration.  It's not very comfortable...",
    );
});

test('a towel is answered before the object is ever named', async () => {
    // sit.c:449-450. The towel arm sits above the xname() line, so the towel
    // is never observed and no tail follows.
    await standOnStairs();
    putObject(TOWEL);
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(
        toplines(), "It's probably not a good time for a picnic...",
    );
});

test('the comfort tail reads Is_box and the material together', async () => {
    // sit.c:470-472. A box suppresses the tail through obj.h Is_box(); a sack
    // suppresses it through objects.c oc_material CLOTH; a food ration has
    // neither and gets the tail. Only the sack has a fresh case, because
    // objnam.c readobjnam() cannot yet wish for a box.
    const cases = [
        [LARGE_BOX, 'You sit on the large box.'],
        [SACK, 'You sit on the sack.'],
        [FOOD_RATION, "You sit on the food ration.  It's not very comfortable..."],
    ];
    for (const [otyp, expected] of cases) {
        await standOnStairs();
        putObject(otyp);
        assert.equal(await dosit(game), ECMD_TIME, `otyp ${otyp}`);
        assert.equal(toplines(), expected);
    }
});

test('an amorphous corpse is squishy and any other corpse is not', async () => {
    // sit.c:458-461. No fresh case reaches the squishy half: on D:1 every
    // amorphous species that leaves a corpse is a mimic the starting hero
    // cannot kill, and objnam.c readobjnam() cannot yet wish for a corpse.
    // The deferred entry sit-amorphous-corpse-has-no-fresh-case records it.
    await standOnStairs();
    const corpse = putObject(CORPSE);
    corpse.corpsenm = PM_ACID_BLOB;
    assert.equal(game.mons[PM_ACID_BLOB].mflags1 & M1_AMORPHOUS,
        M1_AMORPHOUS);
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(toplines(), "You sit on the corpse.  It's squishy...");

    await standOnStairs();
    const lichen = putObject(CORPSE);
    lichen.corpsenm = PM_LICHEN;
    assert.equal(game.mons[PM_LICHEN].mflags1 & M1_AMORPHOUS, 0);
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(
        toplines(), "You sit on the corpse.  It's not very comfortable...",
    );
});

test('a cream pie squelches and is used up', async () => {
    // sit.c:463-468 through invent.c useupf(). The pie leaves the floor, so
    // the square the hero sits on is bare afterwards.
    await standOnStairs();
    const pie = putObject(CREAM_PIE);
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(toplines(), 'You sit on the cream pie.  Squelch!');
    assert.equal(game.level.objects[game.u.ux][game.u.uy], null);
    assert.notEqual(pie.where, OBJ_FLOOR);
});

test('a deaf hero sits on the pie without hearing it', async () => {
    // sit.c:464-467 over youprop.h:125 Deaf, whose three terms this walks in
    // turn: the roleplay conduct, the intrinsic and the extrinsic. Deaf
    // suppresses the Soundeffect() and the line, and useupf() runs either way.
    const deafenings = [
        () => { game.u.uroleplay.deaf = true; },
        () => { game.u.uprops[DEAF].intrinsic = 1; },
        () => { game.u.uprops[DEAF].extrinsic = 1; },
    ];
    for (const [index, deafen] of deafenings.entries()) {
        await standOnStairs();
        putObject(CREAM_PIE);
        deafen();
        assert.equal(await dosit(game), ECMD_TIME, `deafening ${index}`);
        assert.equal(toplines(), 'You sit on the cream pie.');
        assert.equal(game.level.objects[game.u.ux][game.u.uy], null);
        game.u.uroleplay.deaf = false;
        game.u.uprops[DEAF].intrinsic = 0;
        game.u.uprops[DEAF].extrinsic = 0;
    }
});

test('a hero who is not a dragon sits on a coin pile', async () => {
    // sit.c:441. Both terms have to hold: the coin arm belongs to a dragon on
    // gold, and any other hero on the same pile gets the ordinary line.
    await standOnStairs();
    putObject(GOLD_PIECE, { quan: 40 });
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(
        toplines(),
        // objnam.c xname() carries no count; doname() is what would add one.
        "You sit on the gold pieces.  It's not very comfortable...",
    );
});

test('the trap arm reads the trap, u.utrap and u.utraptype separately',
    async () => {
    // sit.c:466. The second disjunct is what catches a hero stuck in lava or
    // buried, whose square carries no trap record at all, and TT_LAVA is the
    // lowest u.utraptype it accepts.
    await standOnFloor();
    game.u.utrap = 3;
    game.u.utraptype = TT_PIT;
    // TT_PIT is below TT_LAVA and no trap sits here, so the chain runs on to
    // the final else.
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(toplines(), 'Having fun sitting on the floor?');

    await standOnFloor();
    game.u.utrap = 3;
    game.u.utraptype = TT_LAVA;
    await assert.rejects(
        () => dosit(game),
        (error) => error instanceof UnsupportedSitError
            && error.message.endsWith("dosit()'s trap arm"),
    );
    game.u.utrap = 0;
});

test('a seen pit under the pile diverts the command into the trap arm',
    async () => {
    // sit.c:437-439. trap.c uteetering_at_seen_pit() is TRUE for a hero who
    // climbed out of a pit and stands on its edge, and it takes the command
    // past the object arm into the trap arm, which this port refuses. This is
    // the case just outside the goal's boundary; the deferred entry
    // sit-teetering-at-a-seen-pit-has-no-differential holds its recipe.
    await standOnStairs();
    putObject(FOOD_RATION);
    game.level.traps.push({
        tx: game.u.ux, ty: game.u.uy, ttyp: PIT, tseen: 1,
    });
    game.u.utrap = 0;
    await assert.rejects(
        () => dosit(game),
        (error) => error instanceof UnsupportedSitError
            && error.message.endsWith("dosit()'s trap arm"),
    );
    assert.equal(toplines(), '');

    // A hero still caught in the pit is not teetering, so the object arm runs
    // even though the trap is there.
    game._ttyToplines = '';
    game.u.utrap = 3;
    game.u.utraptype = TT_PIT;
    assert.equal(await dosit(game), ECMD_TIME);
    assert.equal(
        toplines(), "You sit on the food ration.  It's not very comfortable...",
    );
    game.u.utrap = 0;
});

test('useupf splits a stack and leaves the remainder on the floor', async () => {
    // invent.c useupf():4767-4772. sit.c always passes obj->quan, so only
    // eat.c done_eating(), which passes 1, reaches the split.
    await standOnStairs();
    const pile = putObject(FOOD_RATION, { quan: 3 });
    useupf(pile, 1, {
        state: game,
        hooks: { extractExternalObject: remove_object },
    });
    const left = game.level.objects[game.u.ux][game.u.uy];
    assert.equal(left, pile);
    assert.equal(left.quan, 2);
});

test('useupf refuses to bill a shop and refuses to rehide the hero', async () => {
    // invent.c useupf():4774-4779 and :4782-4783. Neither shk.c addtobill()
    // nor mon.c hideunder() is ported.
    await standOnStairs();
    const pie = putObject(CREAM_PIE);
    makeHeroRoomAShop();
    assert.throws(
        () => useupf(pie, pie.quan, {
            state: game,
            hooks: { extractExternalObject: remove_object },
        }),
        UnsupportedShopError,
    );

    // The tail's own throw is unreachable: delobj() above it runs
    // maybe_unhide_at() over the same square, and that refuses on
    // u.uundetected alone, so a hidden hero never returns from the delete.
    // What the tail's second term still decides is the hider who is *not*
    // hidden, who must be left alone.
    await standOnStairs();
    const second = putObject(CREAM_PIE);
    game.youmonst.data = species({ mflags1: M1_CONCEAL });
    game.u.uundetected = 0;
    useupf(second, second.quan, {
        state: game,
        hooks: { extractExternalObject: remove_object },
    });
    assert.equal(game.level.objects[game.u.ux][game.u.uy], null);

    await standOnStairs();
    const third = putObject(CREAM_PIE);
    game.u.uundetected = 1;
    assert.throws(
        () => useupf(third, third.quan, {
            state: game,
            hooks: { extractExternalObject: remove_object },
        }),
        UnsupportedHideError,
    );
    game.u.uundetected = 0;
});

test('deleting a floor object unhides whoever was under it', async () => {
    // invent.c delobj_core():1455-1460 through mon.c maybe_unhide_at().
    await standOnStairs();
    const ration = putObject(FOOD_RATION);
    delobj(ration, {
        state: game,
        hooks: { extractExternalObject: remove_object },
    });
    assert.equal(game.level.objects[game.u.ux][game.u.uy], null);

    // A monster whose mundetected is set stops the delete, because
    // hideunder() is what maybe_unhide_at() would call for it.
    await standOnStairs();
    const x = game.u.ux + 1;
    const y = game.u.uy;
    const second = mksobj_at(
        FOOD_RATION, x, y, true, false, objectGenerationEnv({ state: game }),
    );
    game.level.monsters[x][y] = newMonster({
        mx: x, my: y, mhp: 3, mundetected: 1, data: species(),
    });
    assert.throws(
        () => delobj(second, {
            state: game,
            hooks: { extractExternalObject: remove_object },
        }),
        UnsupportedHideError,
    );
    game.level.monsters[x][y] = null;
});

test('maybe_unhide_at returns for a square holding nobody', async () => {
    // mon.c maybe_unhide_at():4703-4712. The `else return` arm is the common
    // one, and it must not stop the delete above it.
    await standOnStairs();
    assert.equal(maybe_unhide_at(game.u.ux + 2, game.u.uy + 2, game), undefined);
    // The hero herself is on this square and is not hidden.
    assert.equal(maybe_unhide_at(game.u.ux, game.u.uy, game), undefined);
    game.u.uundetected = 1;
    assert.throws(
        () => maybe_unhide_at(game.u.ux, game.u.uy, game),
        UnsupportedHideError,
    );
    game.u.uundetected = 0;
});
