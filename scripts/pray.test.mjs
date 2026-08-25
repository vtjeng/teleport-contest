import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
    HALLUC_RES,
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
import { UnsupportedTurnBoundaryError } from '../js/allmain.js';
import { paranoid_query } from '../js/cmd.js';
import { bot } from '../js/display.js';
import {
    UnsupportedGetlinBoundaryError,
    tty_yn_function,
} from '../js/getline.js';
import { game } from '../js/gstate.js';
import { near_capacity } from '../js/hack.js';
import { runSegment } from '../js/jsmain.js';
import { PM_ACID_BLOB, PM_GHOUL, PM_HORNED_DEVIL } from '../js/monsters.js';
import { enableRngLog, getRngLog } from '../js/rng.js';
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
    TROUBLE_STUNNED,
    TROUBLE_UNUSEABLE_HANDS,
    TROUBLE_WOUNDED_LEGS,
    UnsupportedPrayerError,
    angrygods,
    can_pray,
    critically_low_hp,
    dopray,
    gods_upset,
    in_trouble,
    prayer_done,
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

const PRAY_C = readFileSync(
    new URL('../nethack-c/upstream/src/pray.c', import.meta.url), 'utf8',
);

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

// pray.c critically_low_hp() has three C call sites: pray.c:220 in_trouble(),
// botl.c:2555's BL_HP hilite and win/tty/wintty.c:4539's hit-point bar. All
// three read u.mh and u.mhmax for a polymorphed hero, so the status line and
// the god have to answer alike about the same hero. js/display.js used to
// carry a second copy with no Upolyd term, which answered differently here.
test('critically_low_hp() reads a polymorphed hero as the status line does',
    async () => {
        const u = (await startedGame()).u;
        // Upolyd is `u.umonnum != u.umonster`; js/u_init.js is its only writer
        // and sets the two equal, so the form is set here by hand.
        u.umonnum = PM_ACID_BLOB;
        game.youmonst.data = game.mons[PM_ACID_BLOB];
        // pray.c:133-137: experience level 1 is rank 0, which divides by 5. So
        // the form's 3 of 40 is critical (3 <= 5) while the hero's own 40 of
        // 40 is not, and only a reader that takes u.mh answers TRUE.
        u.ulevel = 1;
        u.mh = 3;
        u.mhmax = 40;
        u.uhp = 40;
        u.uhpmax = 40;
        assert.equal(critically_low_hp(false, game), true);
        assert.equal(critically_low_hp(true, game), true);

        // wintty.c:4539 dashes the hit-point bar's title when
        // critically_low_hp(TRUE) answers TRUE. A status line reading u.uhp
        // would leave the padding blank.
        game.iflags.wc2_hitpointbar = true;
        const title = () => game.nhDisplay.grid[22]
            .map(({ ch }) => ch).join('').slice(0, 32);
        await bot();
        assert.equal(title(), '[Orison the Stripling - - - - -]');

        // The two status-line call sites differ only in the argument, so an
        // undamaged form is where they part: pray.c:123 returns FALSE before
        // the divisor test when curhp is not below maxhp, while the same hero
        // is critical for botl.c's hilite because 5 <= 5.
        u.mh = 5;
        u.mhmax = 5;
        assert.equal(critically_low_hp(true, game), false);
        assert.equal(critically_low_hp(false, game), true);
        await bot();
        assert.equal(title(), '[Orison the Stripling          ]');
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

// pray.c worst_cursed_item() walks a fixed precedence list. The walk below
// wears the whole list at once and then takes it off from the top, so every
// adjacent pair of the else-if chain is decided with both of its items
// present. Removing an item as the next one is added would leave each pair
// untested, which is how a swapped pair of branches gets through.
test('worst_cursed_item() follows the source precedence order', async () => {
    await startedGame();
    assert.equal(worst_cursed_item(game), null);

    const cursed = (otyp) => object(otyp, { cursed: 1 });
    // pray.c:303-329's worn chain, highest precedence first. The otyp values
    // are arbitrary and distinct: every branch reads `cursed` alone, except
    // the helmet's, whose second term is checked below. The two weapon
    // branches, pray.c:300 and :331, come after this walk because they need a
    // welded weapon rather than a worn one.
    const chain = [
        ['uarmg', 1000], ['uarms', 1001], ['uarmc', 1002], ['uarm', 1003],
        ['uarmh', 1004], ['uarmf', 1005], ['uarmu', 1006], ['uamul', 1007],
        ['uleft', 1008], ['uright', 1009], ['ublindf', 1010],
    ];
    // Put the chain on from the top down. The gloves outrank every later
    // addition, so no addition may move the answer.
    for (const [slot, otyp] of chain) {
        game[slot] = cursed(otyp);
        assert.equal(worst_cursed_item(game), game.uarmg, `wearing ${slot}`);
    }

    // Take them off from the top. Each removal leaves every lower-ranked item
    // in place, so the answer landing on exactly the next slot is what pins
    // one adjacent pair of the chain.
    for (let i = 0; i < chain.length; ++i) {
        const next = chain[i + 1];
        game[chain[i][0]] = null;
        assert.equal(
            worst_cursed_item(game), next ? game[next[0]] : null,
            `after removing ${chain[i][0]}`,
        );
        // pray.c:315-316: a cursed helm of opposite alignment is skipped,
        // because uncursing it would change which god the hero is praying to.
        // Checked while the helm is the highest-ranked item left, so the
        // answer has to fall past it to the boots.
        if (next?.[0] === 'uarmh') {
            game.uarmh.otyp = HELM_OF_OPPOSITE_ALIGNMENT;
            assert.equal(worst_cursed_item(game), game.uarmf);
            game.uarmh.otyp = 1004;
        }
    }

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
// prompt, confirmed, waited out over its three turns, and answered.
//
// The final ' ' answers the --More-- that angrygods()'s line raises: the two
// prayer messages together are 49 columns, and topl.c cannot fit a third on
// the same line. Without it the segment would end on that prompt with the
// rnz(300) below it unspent.
test('#pray runs its three turns and the god takes offence', async () => {
    let boundary = null;
    enableRngLog();
    await runSegment(
        { seed: SEED, datetime: DATETIME, nethackrc: NETHACKRC,
            moves: '.#pray\ny ' },
        { onBoundary: (error) => { boundary = error; } },
    );
    // Nothing stopped: with debug mode off, pray.c:2235's wizard test must not
    // divert the command into the force-success prompt, and rn2(maxanger)
    // landed on one of the two cases the port owns.
    assert.equal(boundary, null);
    // can_pray() answered the arm the goal turns on: an ordinary hero away
    // from an altar prays to her own god, is in no trouble, and is refused for
    // time (u_init.c:1005 leaves u.ublesscnt at 300, and pray.c:2152 tests
    // `u.ublesscnt > 0` when p_trouble is 0).
    assert.equal(game.gp.p_aligntyp, A_LAWFUL);
    assert.equal(game.gp.p_trouble, 0);
    assert.equal(game.gp.p_type, 0);
    // dopray():2216 breaks atheism once the confirmation is answered.
    assert.equal(game.u.uconduct.gnostic, 1);
    // role.c:503 names Tyr as the Valkyrie's lawful god, and angrygods()'s
    // case 0/1 line replaced the pair the top line had been holding.
    assert.equal(game._pending_message, 'You feel that Tyr is displeased.');

    // nomul(-3) bought three turns and moveloop_core() spent all three: one
    // leading wait plus one turn charged to #pray plus two more counted down.
    assert.equal(game.moves, 5);
    // unmul() cleared everything dopray() left for it, so the next
    // multi-turn action starts from nothing.
    assert.equal(game.multi, 0);
    assert.equal(game.nomovemsg, null);
    assert.equal(game.multi_reason, null);
    assert.equal(game.afternmv, null);

    // prayer_done()'s p_type 0 arm, in the order pray.c:2317-2320 runs it.
    // change_luck(-3) from Luck 0: moonphase 7 is neither full nor new, so
    // moveloop_preamble() adjusted nothing first.
    assert.equal(game.flags.moonphase, 7);
    assert.equal(game.u.uluck, -3);
    // gods_upset() raised the hero's own god's anger from 0.
    assert.equal(game.u.ugangr, 1);

    // The draw sequence is what pins the arithmetic. rnz(250) reports its five
    // internal draws and its own result; angrygods() then draws
    // rn2(maxanger). u.ualign.record is the Valkyrie's initrecord of 0, which
    // is below STRIDENT, so pray.c:717 weighs the whole of the three luck
    // points it has just lost: 3 * 1 + 3 = 6.
    const log = getRngLog();
    const prayerDraws = log.slice(log.findIndex(
        (entry) => entry === 'rnz(250)=413',
    ));
    assert.equal(game.u.ualign.record, 0);
    assert.deepEqual(prayerDraws, [
        'rnz(250)=413',
        'rn2(6)=1',
        'rn2(1000)=961', 'rn2(4)=2', 'rne(4)=1', 'rn2(2)=0', 'rnz(300)=152',
    ]);
    // u.ublesscnt is 300 at u_init.c:1005 and allmain.c:328 spends one per
    // elapsed turn. moveloop_preamble() starts svm.moves at 1, so the five it
    // reaches above cost four decrements. prayer_done() then adds rnz(250),
    // and angrygods() raises the total to rnz(300) only when that is larger --
    // it is not, so the sum stands.
    assert.equal(game.u.ublesscnt, 300 - 4 + 413);
});

// pray.c:725 decides how badly the god reacts, and every term of maxanger
// comes from state a live prayer sets. Driving angrygods() directly is the
// only way to reach the combinations one seed cannot, and the bound of the
// rn2() it draws reports maxanger exactly. Cases the port refuses still draw
// first, so the bound is readable either way.
test('angrygods() sizes rn2(maxanger) from anger, luck and alignment',
    async () => {
        await startedGame();
        // pray.c:67 `#define STRIDENT 4`, re-read here so a change to the
        // source constant fails this test rather than being absorbed by it.
        const STRIDENT = Number(
            /#define STRIDENT (\d+)/u.exec(PRAY_C)[1],
        );
        // Each row: [own god?, u.ugangr, Luck, u.ualign.record, bound].
        for (const [coaligned, ugangr, luck, record, bound] of [
            // The recorded Samurai prayer: one point of anger, the three luck
            // points prayer_done() just took, and an initrecord of 10 at or
            // above STRIDENT, so -Luck/3 rather than -Luck. 3*1 + 1.
            [true, 1, -3, 10, 4],
            // The two rows that straddle STRIDENT, which pray.c:717 tests with
            // `>=`. A record of exactly 4 still takes the /3 arm; one point
            // lower pays the whole of the bad luck, 3*1 + 3.
            [true, 1, -3, STRIDENT, 4],
            [true, 1, -3, STRIDENT - 1, 6],
            // Good luck takes the /3 arm whatever the record is, and C's
            // integer division truncates toward zero: 3*2 + (-7/3) = 6 - 2.
            [true, 2, 7, 0, 4],
            // A different god reads half the alignment record instead of the
            // anger: 10/2 + 3.
            [false, 5, -3, 10, 8],
            // ... and halves it toward zero, then subtracts: 11/2 + (-6/3).
            [false, 5, 6, 11, 3],
            // pray.c:721 floors the result at 1, and its test is `< 1`, so
            // the row that separates it from `< 0` is the one that lands on
            // exactly 0: no anger and no luck either way. rn2(0) would return
            // without drawing at all.
            [true, 0, 0, 0, 1],
            // The floor also catches a negative, which is what C's comment
            // ("possible if bad align & good luck") is about.
            [true, 0, 9, 0, 1],
            // pray.c:723 caps it at 15. 3*10 + 10 is 40.
            [true, 10, -10, 0, 15],
        ]) {
            const label = `coaligned=${coaligned} ugangr=${ugangr} `
                + `Luck=${luck} record=${record}`;
            game.u.ugangr = ugangr;
            game.u.uluck = luck;
            game.u.moreluck = 0;
            game.u.ualign.record = record;
            // A row that lands on case 0 or 1 leaves its line on the top row,
            // and the next row's would stop for a --More-- no key answers.
            clearTtyMessageWindow(game);
            const before = getRngLog().length;
            await angrygods(
                coaligned ? A_LAWFUL : A_CHAOTIC, game,
            ).catch((error) => {
                // Cases 2 through 8 and the default are refused by name, and
                // every one of them draws rn2(maxanger) first.
                assert.ok(error instanceof UnsupportedPrayerError, label);
            });
            assert.match(
                getRngLog()[before],
                new RegExp(`^rn2\\(${bound}\\)=`, 'u'),
                label,
            );
            // pray.c:710 strips divine protection whichever case is drawn.
            assert.equal(game.u.ublessed, 0, label);
        }
    });

// pray.c:1436-1440. Anger at the hero's own god accumulates and anger at any
// other god is spent, and only the first of those can raise maxanger.
test('gods_upset() moves u.ugangr toward the god it names', async () => {
    await startedGame();
    game.u.ualign.record = 0;
    game.u.uluck = 0;
    game.u.moreluck = 0;

    const upset = async (align) => {
        // angrygods() runs on every call; clear the line it may leave so the
        // next call's message does not stop for a --More-- no key answers.
        clearTtyMessageWindow(game);
        return gods_upset(align, game).catch((error) => {
            assert.ok(error instanceof UnsupportedPrayerError);
        });
    };

    game.u.ugangr = 0;
    await upset(A_LAWFUL);
    assert.equal(game.u.ugangr, 1);
    await upset(A_LAWFUL);
    assert.equal(game.u.ugangr, 2);
    // A different god spends stored anger instead of adding to it.
    await upset(A_CHAOTIC);
    assert.equal(game.u.ugangr, 1);
    await upset(A_CHAOTIC);
    assert.equal(game.u.ugangr, 0);
    // ... and the `else if (u.ugangr)` guard stops it going negative.
    await upset(A_CHAOTIC);
    assert.equal(game.u.ugangr, 0);
});

// pray.c:727-730 picks its adjective from Hallucination, which youprop.h:120
// reads as the bare HALLUC intrinsic minus either form of Halluc_resistance.
test('angrygods() calls a god bummed rather than displeased when hallucinating',
    async () => {
        await startedGame();
        game.u.ugangr = 0;
        game.u.uluck = 9;
        game.u.moreluck = 0;
        game.u.ualign.record = 0;
        // maxanger floors at 1, so rn2(1) is 0 and case 0 always runs.
        game.u.uprops[HALLUC].intrinsic = 5;
        await angrygods(A_LAWFUL, game);
        assert.equal(game._pending_message, 'You feel that Tyr is bummed.');

        // youprop.h:120 is HHallucination alone, not the usual
        // intrinsic-or-extrinsic pair: a worn source does not make the hero
        // hallucinate for this message.
        clearTtyMessageWindow(game);
        game.u.uprops[HALLUC].intrinsic = 0;
        game.u.uprops[HALLUC].extrinsic = FROMOUTSIDE;
        await angrygods(A_LAWFUL, game);
        assert.equal(game._pending_message, 'You feel that Tyr is displeased.');
        game.u.uprops[HALLUC].extrinsic = 0;
        game.u.uprops[HALLUC].intrinsic = 5;

        // Resistance from either side cancels it, extrinsic included.
        clearTtyMessageWindow(game);
        game.u.uprops[HALLUC_RES].extrinsic = FROMOUTSIDE;
        await angrygods(A_LAWFUL, game);
        assert.equal(game._pending_message, 'You feel that Tyr is displeased.');
        game.u.uprops[HALLUC_RES].extrinsic = 0;
        game.u.uprops[HALLUC].intrinsic = 0;
    });

// pray.c:779-782 sets the pray timer whichever case ran, and only upward.
test('angrygods() raises u.ublesscnt to rnz(300) but never lowers it',
    async () => {
        await startedGame();
        game.u.ugangr = 0;
        game.u.uluck = 9;
        game.u.moreluck = 0;
        game.u.ualign.record = 0;

        game.u.ublesscnt = 0;
        await angrygods(A_LAWFUL, game);
        const raised = game.u.ublesscnt;
        assert.ok(raised > 0, 'rnz(300) raised an empty timer');

        // A timer already past anything rnz(300) can return stays put. rnz()
        // multiplies by at most 1000 * 4 ^ 5 through its rne(4) tail.
        game.u.ublesscnt = 300 * 1000 * 4 ** 5;
        const untouched = game.u.ublesscnt;
        await angrygods(A_LAWFUL, game);
        assert.equal(game.u.ublesscnt, untouched);
    });

// Everything prayer_done() does not own stops by name, at the arm C would
// have taken. Each row leaves the hero exactly where can_pray() would.
test('prayer_done() refuses every arm outside gp.p_type 0', async () => {
    await startedGame();
    for (const [p_type, pattern] of [
        [-2, /Moloch arm/u],
        [-1, /undead arm/u],
        [1, /p_type 1 arm/u],
        [2, /p_type 2 arm/u],
        [3, /pleased\(\)/u],
    ]) {
        game.gp = { p_type, p_aligntyp: A_LAWFUL };
        game.u.uinvulnerable = true;
        await assert.rejects(prayer_done(game), pattern, `p_type ${p_type}`);
        // pray.c:2280 clears invulnerability before any arm is chosen, so the
        // shimmering light dopray() raised is gone even on a refused arm.
        assert.equal(game.u.uinvulnerable, false, `p_type ${p_type}`);
    }

    // pray.c:2308 puts Gehennom ahead of every p_type but -2 and -1.
    // dungeon.c In_hell() reads the dungeon's `hellish` flag, which
    // dat/dungeon.lua sets on exactly one branch.
    game.gp = { p_type: 0, p_aligntyp: A_LAWFUL };
    const uz = game.u.uz;
    const hellDnum = game.dungeons.findIndex((d) => d?.flags?.hellish);
    assert.ok(hellDnum >= 0, 'the dungeon list holds a hellish branch');
    game.u.uz = { dnum: hellDnum, dlevel: 1 };
    await assert.rejects(prayer_done(game), /Gehennom arm/u);
    game.u.uz = uz;

    // pray.c:2316 reaches water_prayer() only for a hero who is both standing
    // on an altar and praying to another alignment. Neither half alone does
    // it, so all three combinations are here.
    const here = game.level.at(game.u.ux, game.u.uy);
    const wasTyp = here.typ;
    const wasMask = here.altarmask;
    here.typ = ALTAR;
    here.altarmask = Align2amask(A_CHAOTIC);
    game.gp = { p_type: 0, p_aligntyp: A_CHAOTIC };
    await assert.rejects(prayer_done(game), /water_prayer\(\)/u);

    for (const [name, typ, aligntyp] of [
        ['a coaligned altar', ALTAR, game.u.ualign.type],
        ['no altar at all', wasTyp, A_CHAOTIC],
    ]) {
        here.typ = typ;
        game.gp = { p_type: 0, p_aligntyp: aligntyp };
        // The ported path prints, so clear the line each pass or the next
        // message stops for a --More-- no key answers.
        clearTtyMessageWindow(game);
        await prayer_done(game).catch((error) => {
            // angrygods() can still refuse whichever case its rn2() draws;
            // what must not happen is the water_prayer() stop.
            assert.ok(error instanceof UnsupportedPrayerError, name);
            assert.doesNotMatch(error.message, /water_prayer/u, name);
        });
    }
    here.typ = wasTyp;
    here.altarmask = wasMask;
});

test('#pray asks its confirmation with the response set and default C shows',
    async () => {
        const prompt = 'Are you sure you want to pray? [yn] (n)';
        const row0 = () => game.nhDisplay.grid[0]
            .map(({ ch }) => ch).join('').trimEnd();
        await startedGame('.#pray\n');
        // topl.c:409-414 builds the prompt as query, " [", resp, "]", " (",
        // def, ")". paranoid_ynq() passes decl.c ynchars[] and 'n', so a set
        // or default the port got wrong would show here.
        assert.equal(row0(), prompt);

        // topl.c:541's addtopl(rtmp) is commented out, so tty_yn_function()'s
        // clean_up never echoes the answer and never wipes the query: the
        // physical top line still carries the prompt after the key is read.
        // js/display.js repaints row 0 from _pending_message on the next
        // flush, so the answered prompt survives only while getline.js keeps
        // that field set.
        await startedGame('.#pray\nn');
        assert.equal(row0(), prompt);
    });

// js/allmain.js runUnmulAtTurnBoundary() converts a refusal raised by the
// ga.afternmv callback into a turn boundary. Without it the first
// prayer_done() or angrygods() stop escapes runSegment() as a hard failure and
// the scorer discards every screen the segment had already matched instead of
// stopping on the last of them. QUALITY.json's angrygods-cases-above-1
// deferral supplies the input; the assertions name the boundary class alone
// and no C screen, which is what keeps them inside that deferral's terms.
test('an afternmv refusal ends the segment instead of escaping it', async () => {
    let boundary = null;
    let replay;
    await assert.doesNotReject(async () => {
        // This seed's rn2(maxanger) lands on angrygods()'s curse arm, which
        // the port refuses. '.' waits, '#pray\n' asks, 'y' confirms, and the
        // trailing ' ' spends the last of nomul(-3)'s three turns, which is
        // when unmul() runs the callback.
        replay = await runSegment({
            seed: 6120000,
            datetime: DATETIME,
            nethackrc: NETHACKRC,
            moves: '.#pray\ny ',
        }, { onBoundary: (error) => { boundary = error; } });
    }, 'a refused afternmv must not escape runSegment()');
    assert.ok(boundary instanceof UnsupportedTurnBoundaryError);
    assert.match(boundary.message, /^a delayed action reached /u);
    // What the conversion buys: the frames matched before the refusal survive.
    assert.ok(replay.getScreens().length > 0);
});

test('a declined #pray spends no move and breaks no conduct', async () => {
    await startedGame('.#pray\nn');
    // dopray():2211 returns ECMD_OK before the conduct counter moves.
    assert.equal(game.u.uconduct.gnostic, 0);
    assert.equal(game.gp?.p_type, undefined);
    // cmd.c rhack() spends a turn only for ECMD_TIME, and allmain.c
    // moveloop_core() counts one per turn from the 1 a started game holds. The
    // '.' wait is the segment's one ECMD_TIME command, so a declined prayer
    // that returned ECMD_TIME instead would leave 3 here.
    assert.equal(game.moves, 2);
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

// topl.c tty_yn_function()'s read loop has four exits. The Escape arm at
// 463-470 and the answer that falls out of the bottom are covered above; these
// are the other two, and each of them decides which key answers the #pray
// confirmation.
test('tty_yn_function rereads an invalid key and quits on quitchars',
    async () => {
        await startedGame();
        const ask = async (resp, ...keys) => {
            for (const key of keys)
                game.nhDisplay.pushKey(key.charCodeAt(0));
            return tty_yn_function('Ring?', resp, 'n', game);
        };
        // topl.c:475-477: a key outside `resp` rings the bell and sets q to 0,
        // which fails the `while (!q)` test and reads again. 'z' is outside
        // 'yn' and is not one of quitchars, so only the reread can reach the
        // 'y' queued behind it.
        assert.equal(await ask('yn', 'z', 'y'), 'y'.charCodeAt(0));
        // topl.c:471-473: decl.c quitchars[] is " \r\n\033", and each of the
        // three that are not Escape answers `def`, here 'n'. Nothing else is
        // queued, so a wrong exit would exhaust the input instead.
        for (const quitchar of [' ', '\r', '\n'])
            assert.equal(await ask('yn', quitchar), 'n'.charCodeAt(0));
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
