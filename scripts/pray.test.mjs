import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ALTAR,
    A_CHAOTIC,
    COLNO,
    A_LAWFUL,
    A_MAX,
    A_NEUTRAL,
    A_STR,
    Align2amask,
    BLINDED,
    CONFUSION,
    DEAF,
    EXT_ENCUMBER,
    FROMOUTSIDE,
    HALLUC,
    HUNGRY,
    HVY_ENCUMBER,
    PASSES_WALLS,
    ROOM,
    SDOOR,
    SICK,
    SLIMED,
    STONE,
    STONED,
    STRANGLED,
    STUNNED,
    TT_BURIEDBALL,
    TT_LAVA,
    UNCHANGING,
    WEAK,
    WOUNDED_LEGS,
    W_SADDLE,
    isok,
} from '../js/const.js';
import { paranoid_query } from '../js/cmd.js';
import {
    UnsupportedGetlinBoundaryError,
    tty_yn_function,
} from '../js/getline.js';
import { game } from '../js/gstate.js';
import { near_capacity } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { PM_ACID_BLOB, PM_GHOUL, PM_HORNED_DEVIL } from '../js/monsters.js';
import { getRngLog } from '../js/rng.js';
import { clearTtyMessageWindow } from '../js/tty_message.js';
import {
    AMULET_OF_UNCHANGING,
    BOULDER,
    FUMBLE_BOOTS,
    GAUNTLETS_OF_FUMBLING,
    HELM_OF_OPPOSITE_ALIGNMENT,
    LEVITATION_BOOTS,
    LOADSTONE,
    LUCKSTONE,
    RIN_LEVITATION,
    SADDLE,
} from '../js/objects.js';
import {
    TROUBLE_BLIND,
    TROUBLE_CONFUSED,
    TROUBLE_CURSED_BLINDFOLD,
    TROUBLE_CURSED_ITEMS,
    TROUBLE_CURSED_LEVITATION,
    TROUBLE_FUMBLING,
    TROUBLE_HALLUCINATION,
    TROUBLE_HIT,
    TROUBLE_HUNGRY,
    TROUBLE_LAVA,
    TROUBLE_POISONED,
    TROUBLE_PUNISHED,
    TROUBLE_SADDLE,
    TROUBLE_REGION,
    TROUBLE_SICK,
    TROUBLE_SLIMED,
    TROUBLE_STARVING,
    TROUBLE_STONED,
    TROUBLE_STRANGLED,
    TROUBLE_STUCK_IN_WALL,
    TROUBLE_STUNNED,
    TROUBLE_UNUSEABLE_HANDS,
    TROUBLE_WOUNDED_LEGS,
    UnsupportedPrayerError,
    can_pray,
    critically_low_hp,
    dopray,
    in_trouble,
    stuck_in_wall,
    worst_cursed_item,
} from '../js/pray.js';

// A hero the port can start and stop at the first command boundary: seed and
// clock chosen for this file, and unrelated to any recorded session. The role
// is the one scripts/run-pray-command.mjs records against.
const NETHACKRC = [
    'OPTIONS=name:Orison,role:Valkyrie,race:human,gender:female,align:lawful',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');
const DATETIME = '20260214081500';
const SEED = 4410003;

async function startedGame(moves = '') {
    await runSegment({
        seed: SEED, datetime: DATETIME, nethackrc: NETHACKRC, moves,
    });
    // With no keys typed the welcome line is still pending, and a call made
    // straight from a test would find it there and stop for a --More-- that no
    // input answers. cmd.c parse() takes it off the line before the first
    // command, which is what a case that types keys gets for free.
    if (!moves) clearTtyMessageWindow(game);
    return game;
}

// A worn or carried object shaped the way in_trouble() reads one: it tests
// otyp and cursed and nothing else.
function object(otyp, { cursed = 0, owt = 0, quan = 1 } = {}) {
    return { otyp, cursed, owt, quan, nobj: null, nexthere: null };
}

// hack.c near_capacity() answers a band, and two of the tests below turn on a
// `>=` that only an exact band separates from `>`. The weight that lands on a
// band depends on the hero's Strength, Constitution and worn armour, so search
// for it rather than write down a number a capacity change would quietly move.
function loadToCapacity(state, band) {
    const load = { otyp: 4090, cursed: 0, quan: 1, owt: 0, nobj: null };
    state.invent = load;
    for (let owt = 0; owt <= 4000; owt += 5) {
        load.owt = owt;
        if (near_capacity(state) === band) return load;
    }
    throw new Error(`no load reaches capacity band ${band}`);
}

function carry(state, ...objects) {
    for (let i = 0; i < objects.length - 1; ++i)
        objects[i].nobj = objects[i + 1];
    state.invent = objects[0] ?? null;
}

// pray.c:76-101 gives every trouble a distinct number, so a test that only
// asserted "nonzero" would pass on the wrong arm. Each case below names the
// value C returns.
test('in_trouble() answers 0 for a fresh hero and one value per arm', async () => {
    let u = (await startedGame()).u;
    // pray.c in_trouble() falls through every test for a hero who has just
    // arrived: this is the answer the #pray boundary depends on.
    assert.equal(in_trouble(game), 0);

    // Major troubles, in the order pray.c tests them. Each mutation is undone
    // before the next, so every case starts from the same fresh 0.
    u.uprops[STONED].intrinsic = 5;
    assert.equal(in_trouble(game), TROUBLE_STONED);
    u.uprops[STONED].intrinsic = 0;

    u.uprops[SLIMED].intrinsic = 5;
    assert.equal(in_trouble(game), TROUBLE_SLIMED);
    u.uprops[SLIMED].intrinsic = 0;

    u.uprops[STRANGLED].intrinsic = 5;
    assert.equal(in_trouble(game), TROUBLE_STRANGLED);
    u.uprops[STRANGLED].intrinsic = 0;

    // Both halves of `u.utrap && u.utraptype == TT_LAVA` matter: a hero held
    // by any other kind of trap is not in lava trouble.
    u.utrap = 3;
    u.utraptype = TT_LAVA;
    assert.equal(in_trouble(game), TROUBLE_LAVA);
    u.utraptype = TT_BURIEDBALL;
    assert.equal(in_trouble(game), TROUBLE_PUNISHED);
    u.utrap = 0;

    u.uprops[SICK].intrinsic = 5;
    assert.equal(in_trouble(game), TROUBLE_SICK);
    u.uprops[SICK].intrinsic = 0;

    // eat.h hunger states are ordered, so the test is `>=`: WEAK and worse are
    // starving, HUNGRY and worse are the minor trouble further down.
    u.uhs = WEAK;
    assert.equal(in_trouble(game), TROUBLE_STARVING);
    u.uhs = HUNGRY;
    assert.equal(in_trouble(game), TROUBLE_HUNGRY);
    u.uhs = 1; /* NOT_HUNGRY */
    assert.equal(in_trouble(game), 0);

    // region.c region_danger() only counts a gas cloud the hero is inside.
    game.level.regions.push({ hero_inside: true, inside_f: 'inside_gas_cloud' });
    assert.equal(in_trouble(game), TROUBLE_REGION);
    game.level.regions.at(-1).hero_inside = false;
    assert.equal(in_trouble(game), 0);
    game.level.regions.pop();

    // critically_low_hp(FALSE): `curhp <= 5` on a fresh Valkyrie. The FALSE is
    // what makes an undamaged hero with five hit points a trouble too, so the
    // maximum is lowered with the current total for one of the two cases.
    const fullHp = u.uhp;
    const fullHpMax = u.uhpmax;
    u.uhp = 5;
    assert.equal(in_trouble(game), TROUBLE_HIT);
    u.uhpmax = 5;
    assert.equal(in_trouble(game), TROUBLE_HIT);
    u.uhp = fullHp;
    u.uhpmax = fullHpMax;

    // monst.h ismnum(): u_init.c leaves u.ulycn at NON_PM (-1).
    u.ulycn = 0;
    assert.equal(in_trouble(game), 6 /* TROUBLE_LYCANTHROPE */);
    u.ulycn = -1;

    u = (await startedGame()).u;
    // pray.c:222 needs both halves, and its capacity test is `>=`, so the load
    // is placed exactly on EXT_ENCUMBER rather than past it. A Strength loss
    // of exactly 3 is not enough, and neither is the weight on its own.
    const load = loadToCapacity(game, EXT_ENCUMBER);
    u.acurr.a[A_STR] = u.amax.a[A_STR] - 3;
    assert.equal(in_trouble(game), TROUBLE_POISONED);
    u.acurr.a[A_STR] = u.amax.a[A_STR] - 4;
    assert.equal(in_trouble(game), 5 /* TROUBLE_COLLAPSING */);
    load.owt = 0;
    assert.equal(in_trouble(game), TROUBLE_POISONED);

    u = (await startedGame()).u;
    // do_wear.c stuck_ring() answers the ring itself when it is cursed.
    game.uleft = object(RIN_LEVITATION, { cursed: 1 });
    assert.equal(in_trouble(game), TROUBLE_CURSED_LEVITATION);
    game.uleft = null;
    game.uright = object(RIN_LEVITATION, { cursed: 1 });
    assert.equal(in_trouble(game), TROUBLE_CURSED_LEVITATION);
    game.uright = null;
    // Cursed_obj() needs all three of object, type and curse.
    game.uarmf = object(LEVITATION_BOOTS, { cursed: 1 });
    assert.equal(in_trouble(game), TROUBLE_CURSED_LEVITATION);
    game.uarmf.cursed = 0;
    assert.equal(in_trouble(game), 0);
    game.uarmf = null;

    // pray.c:233 `nohands() || !freehand()` opens the arm. engrave.c
    // freehand() stays true for a cursed one-handed weapon beside an uncursed
    // shield, so a cursed weapon alone is only the lesser cursed-item trouble;
    // cursing the shield as well is what shuts the hand.
    game.uwep.cursed = 1;
    assert.equal(in_trouble(game), TROUBLE_CURSED_ITEMS);
    game.uarms.cursed = 1;
    assert.equal(in_trouble(game), TROUBLE_UNUSEABLE_HANDS);
    game.uwep.cursed = 0;
    game.uarms.cursed = 0;

    game.ublindf = object(233 /* BLINDFOLD */, { cursed: 1 });
    u.uprops[BLINDED].extrinsic = 1; /* W_TOOL, so Blindfolded is true */
    assert.equal(in_trouble(game), TROUBLE_CURSED_BLINDFOLD);
    u.uprops[BLINDED].extrinsic = 0;
    // youprop.h:96 Blindfolded is EBlinded alone, so a cursed blindfold that
    // is not worn is an ordinary cursed item instead.
    assert.equal(in_trouble(game), TROUBLE_CURSED_ITEMS);
    game.ublindf = null;

    // youprop.h:77 Punished is (uball != 0).
    game.uball = object(BOULDER);
    assert.equal(in_trouble(game), TROUBLE_PUNISHED);
    game.uball = null;

    game.uarmg = object(GAUNTLETS_OF_FUMBLING, { cursed: 1 });
    assert.equal(in_trouble(game), TROUBLE_FUMBLING);
    game.uarmg = null;
    game.uarmf = object(FUMBLE_BOOTS, { cursed: 1 });
    assert.equal(in_trouble(game), TROUBLE_FUMBLING);
    game.uarmf = null;

    // Any other cursed worn item is the lesser TROUBLE_CURSED_ITEMS.
    game.uarmc = object(HELM_OF_OPPOSITE_ALIGNMENT, { cursed: 1 });
    assert.equal(in_trouble(game), TROUBLE_CURSED_ITEMS);
    game.uarmc = null;

    // "can't voluntarily dismount from a cursed saddle": worn.c which_armor()
    // finds it on the steed rather than on the hero.
    const saddle = object(SADDLE, { cursed: 1 });
    saddle.owornmask = W_SADDLE;
    u.usteed = { minvent: saddle };
    assert.equal(in_trouble(game), TROUBLE_SADDLE);
    saddle.cursed = 0;
    assert.equal(in_trouble(game), 0);
    // pray.c:274's `Wounded_legs && !u.usteed`: a rider's legs are not the
    // trouble they would be on foot.
    u.uprops[WOUNDED_LEGS].intrinsic = 4;
    assert.equal(in_trouble(game), 0);
    u.usteed = null;
    assert.equal(in_trouble(game), TROUBLE_WOUNDED_LEGS);
    u.uprops[WOUNDED_LEGS].intrinsic = 0;

    // pray.c:262 `BlindedTimeout > 1L && !(HBlinded & ~TIMEOUT)`: a timeout of
    // exactly 1 is about to expire and is no trouble, and a permanent source
    // outside the timeout suppresses the arm however long the timeout is.
    u.uprops[BLINDED].intrinsic = 1;
    assert.equal(in_trouble(game), 0);
    u.uprops[BLINDED].intrinsic = 2;
    assert.equal(in_trouble(game), TROUBLE_BLIND);
    u.uprops[BLINDED].intrinsic = 2 | FROMOUTSIDE;
    assert.equal(in_trouble(game), 0);
    u.uprops[BLINDED].intrinsic = 0;

    // pray.c:269 reads the deafness timeout with no such extrinsic test.
    u.uprops[DEAF].intrinsic = 1;
    assert.equal(in_trouble(game), 0);
    u.uprops[DEAF].intrinsic = 2;
    assert.equal(in_trouble(game), TROUBLE_BLIND);
    u.uprops[DEAF].intrinsic = 2 | FROMOUTSIDE;
    assert.equal(in_trouble(game), TROUBLE_BLIND);
    u.uprops[DEAF].intrinsic = 0;

    // The attribute scan covers every attribute, not just the first.
    for (let i = 0; i < A_MAX; ++i) {
        u.acurr.a[i] -= 1;
        assert.equal(in_trouble(game), TROUBLE_POISONED);
        u.acurr.a[i] += 1;
    }
    assert.equal(in_trouble(game), 0);

    u.uprops[WOUNDED_LEGS].intrinsic = 4;
    assert.equal(in_trouble(game), TROUBLE_WOUNDED_LEGS);
    u.uprops[WOUNDED_LEGS].intrinsic = 0;
    u.uprops[WOUNDED_LEGS].extrinsic = 4;
    assert.equal(in_trouble(game), TROUBLE_WOUNDED_LEGS);
    u.uprops[WOUNDED_LEGS].extrinsic = 0;

    // The last three read the timeout portion alone.
    u.uprops[STUNNED].intrinsic = 3;
    assert.equal(in_trouble(game), TROUBLE_STUNNED);
    u.uprops[STUNNED].intrinsic = FROMOUTSIDE;
    assert.equal(in_trouble(game), 0);
    u.uprops[STUNNED].intrinsic = 0;

    u.uprops[CONFUSION].intrinsic = 3;
    assert.equal(in_trouble(game), TROUBLE_CONFUSED);
    u.uprops[CONFUSION].intrinsic = 0;

    u.uprops[HALLUC].intrinsic = 3;
    assert.equal(in_trouble(game), TROUBLE_HALLUCINATION);
    u.uprops[HALLUC].intrinsic = 0;

    assert.equal(in_trouble(game), 0);
});

// pray.c:212 gates the hit-point trouble on `(!Upolyd || Unchanging)`. No
// ported path polymorphs the hero, so the first operand is constantly true and
// the second never has to carry the arm; setting Unchanging must therefore
// leave the answer alone rather than change it.
test('in_trouble() hit-point arm ignores Unchanging on an unpolymorphed hero',
    async () => {
        const u = (await startedGame()).u;
        const fullHp = u.uhp;
        u.uhp = 4;
        assert.equal(in_trouble(game), TROUBLE_HIT);
        u.uprops[UNCHANGING].intrinsic = 1;
        assert.equal(in_trouble(game), TROUBLE_HIT);
        u.uprops[UNCHANGING].intrinsic = 0;
        u.uhp = fullHp;
        assert.equal(in_trouble(game), 0);
    });

// pray.c critically_low_hp() maps experience level to a divisor through
// xlev_to_rank(). Every expected value below is read from pray.c:133-152 and
// the `curhp * divisor <= maxhp` comparison at :156, not from a run.
test('critically_low_hp() applies the divisor its rank selects', async () => {
    const u = (await startedGame()).u;
    const check = (ulevel, uhp, uhpmax, onlyIfInjured = false) => {
        u.ulevel = ulevel;
        u.uhp = uhp;
        u.uhpmax = uhpmax;
        return critically_low_hp(onlyIfInjured, game);
    };

    // `curhp <= 5` is unconditional, whatever the maximum.
    assert.equal(check(1, 5, 500), true);
    assert.equal(check(1, 6, 6), false);

    // Rank 1 (explvl 5) divides by 5; hplim is 15*5 = 75, above maxhp 60.
    assert.equal(check(5, 12, 60), true);
    assert.equal(check(5, 13, 60), false);
    // Rank 2 (explvl 6) divides by 6; hplim is 90, still above maxhp 60.
    assert.equal(check(6, 10, 60), true);
    assert.equal(check(6, 11, 60), false);
    // Rank 4 (explvl 14) divides by 7; hplim is 210.
    assert.equal(check(14, 10, 70), true);
    assert.equal(check(14, 11, 70), false);
    // Rank 6 (explvl 22) divides by 8; hplim is 330.
    assert.equal(check(22, 10, 80), true);
    assert.equal(check(22, 11, 80), false);
    // Rank 8 (explvl 30) divides by 9; hplim is 450.
    assert.equal(check(30, 10, 90), true);
    assert.equal(check(30, 11, 90), false);

    // The hplim clamp at pray.c:130-132 is what stops a very high maximum
    // making an ordinary hit-point total look critical: 20*6 is under 200 but
    // over the 90 that 15*ulevel allows.
    assert.equal(check(6, 20, 200), false);
    assert.equal(check(6, 15, 200), true);

    // only_if_injured returns FALSE for an undamaged hero before any of that.
    assert.equal(check(1, 5, 5, true), false);
    assert.equal(check(1, 5, 5, false), true);
});

// pray.c stuck_in_wall() counts the eight neighbours and answers TRUE only for
// eight. Secret doors and secret corridors are the two obstructed types that
// do not count.
test('stuck_in_wall() needs all eight neighbours obstructed', async () => {
    const u = (await startedGame()).u;
    // A hero who has just arrived stands in a room.
    assert.equal(stuck_in_wall(game), false);

    const neighbours = [];
    for (let i = -1; i <= 1; ++i)
        for (let j = -1; j <= 1; ++j)
            if (i || j) neighbours.push(game.level.at(u.ux + i, u.uy + j));
    const restore = neighbours.map((loc) => loc.typ);
    for (const loc of neighbours) loc.typ = STONE;
    assert.equal(stuck_in_wall(game), true);

    // Seven is not eight.
    neighbours[0].typ = ROOM;
    assert.equal(stuck_in_wall(game), false);
    // A secret door or corridor is obstructed but excluded by name.
    neighbours[0].typ = SDOOR;
    assert.equal(stuck_in_wall(game), false);
    neighbours[0].typ = STONE;
    assert.equal(stuck_in_wall(game), true);

    // Passes_walls answers FALSE before the scan runs at all.
    u.uprops[PASSES_WALLS].intrinsic = 1;
    assert.equal(stuck_in_wall(game), false);
    u.uprops[PASSES_WALLS].intrinsic = 0;
    u.uprops[PASSES_WALLS].extrinsic = 1;
    assert.equal(stuck_in_wall(game), false);
    u.uprops[PASSES_WALLS].extrinsic = 0;

    for (let i = 0; i < neighbours.length; ++i) neighbours[i].typ = restore[i];
    assert.equal(stuck_in_wall(game), false);
});

// pray.c blocked_boulder(), reached only through stuck_in_wall(): a square
// holding an unpushable boulder counts as obstructed even when its terrain is
// not. Two boulders on dry land are unpushable outright (pray.c:2697-2706).
test('stuck_in_wall() counts a square blocked by boulders', async () => {
    const u = (await startedGame()).u;
    const neighbours = [];
    for (let i = -1; i <= 1; ++i)
        for (let j = -1; j <= 1; ++j)
            if (i || j) neighbours.push([u.ux + i, u.uy + j]);
    const restore = neighbours.map(([x, y]) => game.level.at(x, y).typ);
    for (const [x, y] of neighbours) game.level.at(x, y).typ = STONE;

    // Open one neighbour up again, then block it with a two-boulder pile.
    const [ox, oy] = neighbours[0];
    game.level.at(ox, oy).typ = ROOM;
    assert.equal(stuck_in_wall(game), false);
    game.level.objects[ox][oy] = object(BOULDER, { quan: 2 });
    assert.equal(stuck_in_wall(game), true);
    // One boulder is pushable when the square beyond it is open floor.
    game.level.objects[ox][oy].quan = 1;
    game.level.at(u.ux + 2 * (ox - u.ux), u.uy + 2 * (oy - u.uy)).typ = ROOM;
    assert.equal(stuck_in_wall(game), false);

    // pray.c:2713 blocks the push when the square beyond is obstructed, and
    // :2715 when it already holds a boulder.
    const [bx, by] = [u.ux + 2 * (ox - u.ux), u.uy + 2 * (oy - u.uy)];
    game.level.at(bx, by).typ = STONE;
    assert.equal(stuck_in_wall(game), true);
    game.level.at(bx, by).typ = ROOM;
    game.level.objects[bx][by] = object(BOULDER);
    assert.equal(stuck_in_wall(game), true);
    game.level.objects[bx][by] = null;
    assert.equal(stuck_in_wall(game), false);

    // pray.c:2709: a diagonal push is impossible in Sokoban whatever lies
    // beyond. Whether this neighbour is diagonal decides which half of
    // `dx && dy` the flag meets.
    const diagonal = ox !== u.ux && oy !== u.uy;
    game.level.flags.sokoban_rules = true;
    assert.equal(stuck_in_wall(game), diagonal);
    game.level.flags.sokoban_rules = false;

    game.level.objects[ox][oy] = null;
    for (let i = 0; i < neighbours.length; ++i) {
        const [x, y] = neighbours[i];
        game.level.at(x, y).typ = restore[i];
    }
});

// pray.c:2711, the one arm of blocked_boulder() the hero has to stand at the
// map edge to reach: the square two steps out is off the map, so the boulder
// has nowhere to go.
test('stuck_in_wall() counts a boulder that would be pushed off the map',
    async () => {
        const u = (await startedGame()).u;
        u.ux = COLNO - 2;
        for (let i = -1; i <= 1; ++i)
            for (let j = -1; j <= 1; ++j) {
                if (!i && !j) continue;
                game.level.at(u.ux + i, u.uy + j).typ = STONE;
            }
        assert.equal(stuck_in_wall(game), true);
        // The one neighbour whose own second step leaves the map: open it, and
        // seven obstructed neighbours are not eight.
        game.level.at(u.ux + 1, u.uy).typ = ROOM;
        assert.equal(stuck_in_wall(game), false);
        game.level.objects[u.ux + 1][u.uy] = object(BOULDER);
        assert.equal(isok(u.ux + 2, u.uy), false);
        assert.equal(stuck_in_wall(game), true);
        game.level.objects[u.ux + 1][u.uy] = null;
    });

// pray.c worst_cursed_item() walks a fixed precedence list. Each step below
// adds the item the previous step's answer outranked, so the answer has to
// move exactly one place down the list.
test('worst_cursed_item() follows the source precedence order', async () => {
    await startedGame();
    assert.equal(worst_cursed_item(game), null);

    const cursed = (otyp) => object(otyp, { cursed: 1 });
    // Arbitrary object types: this function reads `cursed` and, for the two
    // named exceptions below, `otyp`.
    game.uarmg = cursed(1000);
    assert.equal(worst_cursed_item(game), game.uarmg);
    game.uarms = cursed(1001);
    assert.equal(worst_cursed_item(game), game.uarmg);
    game.uarmg = null;
    assert.equal(worst_cursed_item(game), game.uarms);
    game.uarmc = cursed(1002);
    game.uarms = null;
    assert.equal(worst_cursed_item(game), game.uarmc);
    game.uarm = cursed(1003);
    game.uarmc = null;
    assert.equal(worst_cursed_item(game), game.uarm);
    game.uarmh = cursed(1004);
    game.uarm = null;
    assert.equal(worst_cursed_item(game), game.uarmh);
    // pray.c:318-320: a cursed helm of opposite alignment is skipped, because
    // uncursing it would change which god the hero is praying to.
    game.uarmh.otyp = HELM_OF_OPPOSITE_ALIGNMENT;
    assert.equal(worst_cursed_item(game), null);
    game.uarmf = cursed(1005);
    assert.equal(worst_cursed_item(game), game.uarmf);
    game.uarmh = null;
    game.uarmu = cursed(1006);
    game.uarmf = null;
    assert.equal(worst_cursed_item(game), game.uarmu);
    game.uamul = cursed(1007);
    game.uarmu = null;
    assert.equal(worst_cursed_item(game), game.uamul);
    game.uleft = cursed(1008);
    game.uamul = null;
    assert.equal(worst_cursed_item(game), game.uleft);
    game.uright = cursed(1009);
    game.uleft = null;
    assert.equal(worst_cursed_item(game), game.uright);
    game.ublindf = cursed(1010);
    game.uright = null;
    assert.equal(worst_cursed_item(game), game.ublindf);
    game.ublindf = null;

    // pray.c:300 puts a welded weapon first, but only while a right-hand ring
    // or a two-handed grip makes it interfere; otherwise pray.c:325 picks it
    // up after every worn layer.
    game.uwep.cursed = 1;
    game.uarmg = cursed(1011);
    // Without a right-hand ring and with a one-handed weapon, the gloves win.
    assert.equal(worst_cursed_item(game), game.uarmg);
    game.uright = object(1014);
    assert.equal(worst_cursed_item(game), game.uwep);
    game.uright = null;
    game.uwep.cursed = 0;
    assert.equal(worst_cursed_item(game), game.uarmg);
    game.uarmg = null;
    // pray.c:325 picks the welded weapon up once no worn layer outranks it.
    game.uwep.cursed = 1;
    assert.equal(worst_cursed_item(game), game.uwep);
    game.uwep.cursed = 0;

    // pray.c:328 takes an active secondary weapon even unwelded, and only
    // while two-weapon combat is on.
    game.uswapwep = cursed(1012);
    game.u.twoweap = false;
    assert.equal(worst_cursed_item(game), null);
    game.u.twoweap = true;
    assert.equal(worst_cursed_item(game), game.uswapwep);
    game.uswapwep = null;
    game.u.twoweap = false;

    // pray.c:333-338 falls back to carried items, and stops only on a
    // loadstone or something that confers luck. A cursed object that is
    // neither is skipped, and an uncursed loadstone is not a candidate.
    const plain = object(4000, { cursed: 1 });
    const stone = object(LOADSTONE, { cursed: 1 });
    const luck = object(LUCKSTONE, { cursed: 1 });
    carry(game, plain);
    assert.equal(worst_cursed_item(game), null);
    carry(game, plain, stone);
    assert.equal(worst_cursed_item(game), stone);
    carry(game, plain, luck);
    assert.equal(worst_cursed_item(game), luck);
    stone.cursed = 0;
    carry(game, plain, stone, luck);
    assert.equal(worst_cursed_item(game), luck);
    stone.cursed = 1;

    // pray.c:292-296 checks for a cursed loadstone ahead of everything else,
    // but only once the hero is strained or worse. The test is `>=`, so the
    // load is placed exactly on HVY_ENCUMBER.
    const load = loadToCapacity(game, HVY_ENCUMBER);
    load.nobj = stone;
    game.uarmg = cursed(1013);
    assert.equal(worst_cursed_item(game), stone);
    // One band lighter and the gloves win again.
    load.owt = 0;
    assert.ok(near_capacity(game) < HVY_ENCUMBER);
    assert.equal(worst_cursed_item(game), game.uarmg);
    game.uarmg = null;
});

// The real consumer: the #pray command, dispatched from the extended-command
// prompt, confirmed, and waited out over the three turns nomul(-3) buys.
test('#pray confirms, waits three turns, and stops at prayer_done()',
    async () => {
        let boundary = null;
        await runSegment(
            { seed: SEED, datetime: DATETIME, nethackrc: NETHACKRC,
                moves: '.#pray\ny' },
            { onBoundary: (error) => { boundary = error; } },
        );
        // The named refusal, and the name is prayer_done(): with debug mode
        // off, pray.c:2235's wizard test must not divert the command into the
        // force-success prompt instead. The class is the turn boundary rather
        // than the command one, because hack.c unmul() calls the callback from
        // inside allmain.c's once-per-turn block, with js/cmd.js
        // failClosedCommand() long off the stack.
        assert.equal(boundary?.name, 'UnsupportedTurnBoundaryError');
        assert.match(boundary.message, /a delayed action reached .*prayer_done\(\)/u);
        // can_pray() ran and answered the arm the goal turns on: an ordinary
        // hero away from an altar prays to her own god, is in no trouble, and
        // is refused for time (u_init.c:1005 leaves u.ublesscnt at 300, and
        // pray.c:2152 tests `u.ublesscnt > 0` when p_trouble is 0).
        assert.equal(game.gp.p_aligntyp, A_LAWFUL);
        assert.equal(game.gp.p_trouble, 0);
        assert.equal(game.gp.p_type, 0);
        // dopray():2216 breaks atheism once the confirmation is answered.
        assert.equal(game.u.uconduct.gnostic, 1);

        // nomul(-3) bought three turns and moveloop_core() spent all three.
        // moveloop_preamble() starts svm.moves at 1, so one leading wait plus
        // the turn #pray charges plus two counted down reach 5.
        assert.equal(game.moves, 5);
        // u_init.c:1005 starts u.ublesscnt at 300 and allmain.c:328 spends one
        // on each of those four elapsed turns.
        assert.equal(game.u.ublesscnt, 300 - 4);
        // unmul() zeroed the count and spent the message before the callback
        // stopped, exactly as it does when the callback succeeds. role.c:503
        // names Tyr as the Valkyrie's lawful god, so the top line holds both
        // of the prayer's messages.
        assert.equal(game.multi, 0);
        assert.equal(game.nomovemsg, null);
        assert.equal(game.multi_reason, null);
        assert.equal(
            game._pending_message,
            'You begin praying to Tyr.  You finish your prayer.',
        );
        // ga.afternmv is cleared before the callback runs, so the refusal
        // leaves nothing scheduled behind it.
        assert.equal(game.afternmv, null);
    });

test('#pray asks its confirmation with the response set and default C shows',
    async () => {
        await startedGame('.#pray\n');
        // topl.c:409-414 builds the prompt as query, " [", resp, "]", " (",
        // def, ")". paranoid_ynq() passes decl.c ynchars[] and 'n', so a set
        // or default the port got wrong would show here.
        assert.equal(
            game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd(),
            'Are you sure you want to pray? [yn] (n)',
        );
    });

test('a declined #pray spends no move and breaks no conduct', async () => {
    await startedGame('.#pray\nn');
    // dopray():2211 returns ECMD_OK before the conduct counter moves.
    assert.equal(game.u.uconduct.gnostic, 0);
    assert.equal(game.gp?.p_type, undefined);
});

// pray.c:212 and :236-239 are the two arms only a polymorphed hero reaches.
// js/u_init.js writes u.umonnum === u.umonster and nothing else moves it, so
// the form is set here by hand; the arms are still C's, and getting them wrong
// would surface the moment a polymorph path lands.
test('in_trouble() polymorph arms read Unchanging and unchanger()',
    async () => {
        const u = (await startedGame()).u;
        u.umonnum = PM_ACID_BLOB;
        game.youmonst.data = game.mons[PM_ACID_BLOB];
        // An acid blob has no hands, so pray.c:233 opens; keep the form's hit
        // points clear of critically_low_hp() so the major arm above it does
        // not answer first.
        u.mh = 100;
        u.mhmax = 100;

        // pray.c:236-238 with Unchanging clear: the hands are simply unusable.
        assert.equal(in_trouble(game), TROUBLE_UNUSEABLE_HANDS);
        // With Unchanging set and nothing conferring it, the shape is
        // permanent and C stops calling it a trouble it could fix.
        u.uprops[UNCHANGING].intrinsic = 1;
        assert.equal(in_trouble(game), 0);
        // do_wear.c unchanger() finds the amulet, and only a cursed one brings
        // the trouble back.
        game.uamul = object(AMULET_OF_UNCHANGING);
        assert.equal(in_trouble(game), 0);
        game.uamul.cursed = 1;
        assert.equal(in_trouble(game), TROUBLE_UNUSEABLE_HANDS);
        game.uamul = null;

        // pray.c:212's `(!Upolyd || Unchanging)`: a polymorphed hero's hit
        // points are only a trouble while the shape cannot change back. The
        // extrinsic half of Unchanging carries it as well as the intrinsic.
        u.mh = 4;
        assert.equal(in_trouble(game), TROUBLE_HIT);
        u.uprops[UNCHANGING].intrinsic = 0;
        assert.equal(in_trouble(game), TROUBLE_UNUSEABLE_HANDS);
        u.uprops[UNCHANGING].extrinsic = 1;
        assert.equal(in_trouble(game), TROUBLE_HIT);
        u.uprops[UNCHANGING].extrinsic = 0;
    });

// pray.c can_pray() decides p_type from five inputs. Each row names the one it
// moves; the expected value restates pray.c:2146-2160 rather than a run.
test('can_pray() computes p_type from trouble, delay, luck and alignment',
    async () => {
        // p_trouble is whatever in_trouble() answers, so the rows induce the
        // sign they need: petrification is +14, hallucination is -11.
        const troubles = { positive: STONED, negative: HALLUC };
        const rows = [
            // "too soon": the delay each trouble sign is measured against.
            // Each threshold is `>`, so the row on the threshold is what
            // separates it from `>=`.
            { trouble: 'positive', ublesscnt: 201, p_type: 0 },
            { trouble: 'positive', ublesscnt: 200, p_type: 3 },
            { trouble: 'negative', ublesscnt: 101, p_type: 0 },
            { trouble: 'negative', ublesscnt: 100, p_type: 3 },
            { trouble: null, ublesscnt: 1, p_type: 0 },
            { trouble: null, ublesscnt: 0, p_type: 3 },
            // A hero in no trouble is held to the strictest of the three, so
            // a delay between the thresholds still answers "too soon".
            { trouble: null, ublesscnt: 150, p_type: 0 },
            { trouble: null, ublesscnt: 50, p_type: 0 },
            // "too naughty": any one of the three is enough on its own, and
            // each test is strict.
            { trouble: null, ublesscnt: 0, uluck: -1, p_type: 1 },
            { trouble: null, ublesscnt: 0, uluck: 0, p_type: 3 },
            { trouble: null, ublesscnt: 0, ugangr: 1, p_type: 1 },
            { trouble: null, ublesscnt: 0, record: -1, p_type: 1 },
            { trouble: null, ublesscnt: 0, record: 0, p_type: 3 },
        ];
        for (const row of rows) {
            const u = (await startedGame()).u;
            if (row.trouble) u.uprops[troubles[row.trouble]].intrinsic = 5;
            u.ublesscnt = row.ublesscnt;
            u.uluck = row.uluck ?? 0;
            u.moreluck = 0;
            u.ugangr = row.ugangr ?? 0;
            u.ualign.record = row.record ?? 10;
            assert.equal(await can_pray(true, game), true);
            assert.equal(game.gp.p_type, row.p_type, JSON.stringify(row));
        }
    });

test('can_pray() reads the hero own alignment when she is not on an altar',
    async () => {
        // pray.c:2136's first test is `u.ualign.type &&`, which is false for a
        // neutral hero. Without it the same line would read 0 == -0 as an
        // opposite-alignment altar and negate her record.
        const u = (await startedGame()).u;
        u.ualign.type = A_NEUTRAL;
        u.ualign.record = 10;
        u.ublesscnt = 0;
        assert.equal(await can_pray(true, game), true);
        assert.equal(game.gp.p_aligntyp, A_NEUTRAL);
        assert.equal(game.gp.p_type, 3);
    });

test('can_pray() prays to the altar it stands on', async () => {
    const u = (await startedGame()).u;
    u.ublesscnt = 0;
    u.ualign.record = 10;
    const here = game.level.at(u.ux, u.uy);
    here.typ = ALTAR;
    // pray.c:2158 asks whether the altar's god is the hero's own. On her own
    // altar it is, so the prayer is the ordinary p_type 3 rather than the
    // p_type 2 that praying on someone else's altar produces.
    here.altarmask = Align2amask(A_LAWFUL);
    assert.equal(await can_pray(true, game), true);
    assert.equal(game.gp.p_aligntyp, A_LAWFUL);
    assert.equal(game.gp.p_type, 3);
});

test('can_pray() refuses a demon whose god is not neutral', async () => {
    const u = (await startedGame()).u;
    game.youmonst.data = game.mons[PM_HORNED_DEVIL];
    // pray.c:2129's guard reads `p_aligntyp == A_LAWFUL || p_aligntyp !=
    // A_NEUTRAL`, so a chaotic demon is refused even though the comment beside
    // it says chaotic is allowed.
    u.ualign.type = A_CHAOTIC;
    assert.equal(await can_pray(true, game), false);
    assert.equal(game._pending_message,
        'The very idea of praying to a lawful god is repugnant to you.');
    // A_NEUTRAL is the one alignment the guard lets through, and its own
    // wording is unreachable for that reason.
    const fresh = (await startedGame()).u;
    game.youmonst.data = game.mons[PM_HORNED_DEVIL];
    fresh.ualign.type = A_NEUTRAL;
    assert.equal(await can_pray(true, game), true);
    assert.equal(game._pending_message, 'You begin praying to Odin.');
});

test('can_pray() turns an undead hero away without drawing for a lawful god',
    async () => {
        let u = (await startedGame()).u;
        game.youmonst.data = game.mons[PM_GHOUL];
        u.ublesscnt = 0;
        // pray.c:2164-2167: lawful is enough on its own, so no draw happens.
        const before = getRngLog().length;
        assert.equal(await can_pray(true, game), true);
        assert.equal(game.gp.p_type, -1);
        assert.equal(getRngLog().length, before);

        // A chaotic undead hero matches neither half, and C short-circuits
        // before rn2(10) because the alignment test is `&&`.
        u = (await startedGame()).u;
        game.youmonst.data = game.mons[PM_GHOUL];
        u.ualign.type = A_CHAOTIC;
        u.ublesscnt = 0;
        const chaoticBefore = getRngLog().length;
        assert.equal(await can_pray(true, game), true);
        assert.equal(game.gp.p_type, 3);
        assert.equal(getRngLog().length, chaoticBefore);
    });

test('can_pray(FALSE) answers whether praying would be safe', async () => {
    const u = (await startedGame()).u;
    // pray.c:2171. The enlightenment caller wants a boolean rather than the
    // prayer itself: only an untroubled p_type 3 outside Gehennom is safe.
    u.ublesscnt = 0;
    u.ualign.record = 10;
    assert.equal(await can_pray(false, game), true);
    assert.equal(game.gp.p_type, 3);
    u.ublesscnt = 300;
    assert.equal(await can_pray(false, game), false);
    assert.equal(game.gp.p_type, 0);
    // And with praying set it answers TRUE whatever p_type came out.
    assert.equal(await can_pray(true, game), true);
});

test('dopray() stops at the debug-mode force-success prompt', async () => {
    await startedGame('.#pray\n');
    game.wizard = true;
    game.nhDisplay.pushKey('y'.charCodeAt(0));
    try {
        // pray.c:2235's `wizard && gp.p_type >= 0`. p_type is 0 here, so the
        // `>=` is what admits it; the prompt itself is unported.
        await assert.rejects(
            dopray(game),
            (error) => error instanceof UnsupportedPrayerError
                && /wizard force-success prompt/u.test(error.message),
        );
        assert.equal(game.gp.p_type, 0);
    } finally {
        game.wizard = false;
    }
});

// pray.c:2265-2270, the arm dopray() takes after scheduling the wait: a hero
// whose god has nothing against her is made invulnerable for the three turns
// and told so. u.ublesscnt is what keeps can_pray() off gp.p_type 3 for every
// prayer a fresh hero can make, so a game long enough to spend it down is what
// this stands in for.
test('dopray() stops at the shimmering light with the wait already set',
    async () => {
        await startedGame('.#pray\n');
        // u_init.c:1005 leaves this at 300 and allmain.c:328 spends one a
        // turn; at 0, pray.c:2152's `u.ublesscnt > 0` fails and a hero with no
        // trouble, no bad luck and no angry god reaches p_type 3.
        game.u.ublesscnt = 0;
        game.nhDisplay.pushKey('y'.charCodeAt(0));
        await assert.rejects(
            dopray(game),
            (error) => error instanceof UnsupportedPrayerError
                && /pre-prayer invulnerability/u.test(error.message),
        );
        assert.equal(game.gp.p_type, 3);
        // C runs nomul(-3) and the three assignments before this test, so the
        // wait is already scheduled when the stop happens.
        assert.equal(game.multi, -3);
        assert.equal(game.nomovemsg, 'You finish your prayer.');
    });

// cmd.c paranoid_query() and win/tty/topl.c tty_yn_function()'s restricted
// arm. The #pray confirmation is their only ported consumer, so they are
// exercised here rather than beside a command that cannot reach them.
test('paranoid_query answers the key it read', async () => {
    await startedGame();
    const ask = async (key) => {
        game.nhDisplay.pushKey(key.charCodeAt(0));
        return paranoid_query(false, 'Sure?', game);
    };
    assert.equal(await ask('y'), true);
    // cmd.c:5647 folds everything that is not 'y' -- and, without accept_q,
    // 'q' too -- back to 'n'.
    assert.equal(await ask('n'), false);
    // decl.c ynchars[] and the 'n' default are what the prompt shows. With
    // accept_q the set would read [ynq], which no ported caller asks for.
    assert.equal(
        game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd(),
        'Sure? [yn] (n)',
    );
});

test('tty_yn_function folds the answer only over A-Z', async () => {
    await startedGame();
    const ask = async (resp, key) => {
        game.nhDisplay.pushKey(key.charCodeAt(0));
        return tty_yn_function('Ring?', resp, 'n', game);
    };
    // hacklib.c lowc() sets bit 040 for 'A'-'Z' and for nothing else, so the
    // two ends of that range are what separate `>=` from `>` and `<=` from
    // `<`.
    assert.equal(await ask('az', 'A'), 'a'.charCodeAt(0));
    assert.equal(await ask('az', 'Z'), 'z'.charCodeAt(0));
    // '@' is one below 'A' and would become '`' if the range test were an
    // `||` rather than an `&&`, which no response set holds.
    assert.equal(await ask('a@', '@'), '@'.charCodeAt(0));
});

test('tty_yn_function stops on the response sets it cannot read', async () => {
    await startedGame();
    const row = game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
    for (const [resp, reason] of [
        ['yn#', /yn_number/u],
        ['yN', /preserving case/u],
        ['yn\x1Bq', /hidden responses/u],
    ]) {
        await assert.rejects(
            tty_yn_function('Ring?', resp, 'n', game),
            (error) => error instanceof UnsupportedGetlinBoundaryError
                && reason.test(error.message),
        );
    }
    // topl.c:397-408 reads all three out of `resp` before the prompt is built.
    assert.equal(
        game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd(), row,
    );
});
