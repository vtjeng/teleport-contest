// Direct tests for dog.c abuse_dog() and the sounds.c verbs it reaches,
// growl() and yelp(). The three recipes/pet-abuse-*.session.json fresh
// differentials cover what a live game shows: a landed hit on a little dog
// that yelps and then flees, one that growls, and one on a pony, whose
// MS_NEIGH has no yelp verb. The arms below are the ones a recording cannot
// reach cheaply -- the whole growl_sound() table, deafness, the halving arm,
// and the pet that is midway off the level.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { abuse_dog } from '../js/dog.js';
import {
    AGGRAVATE_MONSTER,
    CONFLICT,
    DEAF,
    EDOG,
    HALLUC,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import { growl, growl_sound, h_sounds, yelp } from '../js/sounds.js';
import {
    PM_GNOME,
    PM_JACKAL,
    PM_KITTEN,
    PM_PONY,
    PM_LITTLE_DOG,
    PM_LICHEN,
    PM_NEWT,
} from '../js/monsters.js';

// split('\n') is zero-based and C line numbers are one-based.
const SOUNDS_C = readFileSync(
    new URL('../nethack-c/upstream/src/sounds.c', import.meta.url), 'utf8',
).split('\n');
const lineOf = (number) => SOUNDS_C[number - 1].trim();

const DATETIME = '20260214031500';
const RC = [
    'OPTIONS=name:Abuse,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    // pettype:none keeps the starting pet off the map, so every monster below
    // is one the test placed itself.
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

// A seed whose Valkyrie starts in an ordinary lit room, so canseemon() is true
// for a monster placed beside her and growl()'s print guard opens.
const SEED = 7700376;

async function hero() {
    await runSegment({
        seed: SEED, datetime: DATETIME, nethackrc: RC, moves: '',
    });
    resetTopLine();
    return game;
}

// A tame monster beside the hero, tame enough to be worth abusing. mtame 10 is
// what dog.c initedog() gives a domestic starting pet.
function pet(speciesIndex, overrides = {}) {
    const monster = newMonster({
        mx: game.u.ux + 1,
        my: game.u.uy,
        mhp: 8,
        mhpmax: 8,
        mcanmove: 1,
        mcansee: 1,
        mtame: 10,
        data: game.mons[speciesIndex],
        ...overrides,
    });
    monster.mextra = { edog: { abuse: 0 } };
    return monster;
}

// Each assertion below calls a message-printing function directly, outside the
// command loop that would normally dismiss the previous line. Clearing the
// pending message keeps a second call from asking this caller for the key that
// a --More-- prompt would need.
function resetTopLine() {
    game._pending_message = '';
    game.nhDisplay.toplines = '';
    game.nhDisplay.toplin = 0;
}

function lines() {
    const text = game.nhDisplay.toplines ?? '';
    resetTopLine();
    return text;
}

function setProperty(index, on) {
    game.u.uprops[index].intrinsic = on ? 1 : 0;
}

// The injected random source for abuse_dog(), growl() and yelp(). `bounds`
// records every draw as `rn2(<bound>)` in order, and each draw takes the next
// queued roll; a draw past the end of the queue is a draw C does not make, so
// it fails rather than answering.
function rolls(list) {
    const queue = [...list];
    const bounds = [];
    return {
        bounds,
        rn2(bound) {
            bounds.push(`rn2(${bound})`);
            if (!queue.length) throw new Error(`unexpected rn2(${bound})`);
            return queue.shift();
        },
    };
}

// A sleeping monster on the level's monster list, placed for wake_nearto()
// to find. mundetected keeps canSeeMonster() false, so wake_msg() prints
// nothing and the only trace of waking is msleeping.
function sleeper(x, y) {
    const monster = newMonster({
        mx: x,
        my: y,
        mhp: 8,
        mhpmax: 8,
        mcanmove: 1,
        msleeping: 1,
        mundetected: 1,
        data: game.mons[PM_JACKAL],
    });
    monster.nmon = game.level.monlist;
    game.level.monlist = monster;
    return monster;
}

test('h_sounds matches sounds.c:341-348 entry for entry', () => {
    // The table's opening and closing lines, so that a shift in sounds.c is
    // reported as a moved table rather than as a wrong entry.
    assert.equal(lineOf(341), 'static const char *const h_sounds[] = {');
    assert.equal(lineOf(348), '};');
    // Lines 342-347 hold the 35 string literals, six to a line except the
    // last, in table order.
    const expected = SOUNDS_C.slice(341, 347).join(' ')
        .match(/"[^"]*"/gu)
        .map((literal) => literal.slice(1, -1));
    assert.equal(expected.length, 35);
    assert.deepEqual([...h_sounds], expected);
});

test('growl_sound maps every msound case in sounds.c:351-396', async () => {
    await hero();
    // One species per switch arm, with the verb read from sounds.c. Species
    // whose msound has no case fall to the default "scream"; the gnome is
    // MS_ORC, which is one of them.
    const cases = [
        [PM_KITTEN, 'hiss'], /* MS_MEW */
        [PM_LITTLE_DOG, 'growl'], /* MS_BARK */
        [PM_PONY, 'neigh'], /* MS_NEIGH */
        [PM_LICHEN, 'commotion'], /* MS_SILENT */
        [PM_GNOME, 'scream'], /* MS_ORC, the default arm */
    ];
    for (const [speciesIndex, verb] of cases) {
        assert.equal(growl_sound({ data: game.mons[speciesIndex] }), verb);
    }
});

test('abuse_dog spends tameness and makes the pet complain', async () => {
    await hero();

    // dog.c:1370-1373. Ordinary abuse decrements mtame by one and, for a pet
    // that is still tame and not a minion, raises EDOG()->abuse.
    const dog = pet(PM_LITTLE_DOG);
    // dog.c:1381 draws rn2(mtmp->mtame) on the already-decremented tameness,
    // so the bound is 9, not 10. A nonzero roll (1 is the smallest) takes the
    // yelp() arm; MS_BARK yelps at sounds.c:447.
    let random = rolls([1]);
    await abuse_dog(dog, game, random);
    assert.equal(dog.mtame, 9);
    assert.equal(EDOG(dog).abuse, 1);
    assert.deepEqual(random.bounds, ['rn2(9)']);
    assert.equal(lines(), 'The little dog yelps!');

    // dog.c:1368. Conflict halves tameness instead, and schar division
    // truncates toward zero: 9 / 2 is 4, and the draw's bound follows it.
    // A zero roll takes the growl() arm at dog.c:1384; MS_BARK growls at
    // sounds.c:362.
    setProperty(CONFLICT, true);
    random = rolls([0]);
    await abuse_dog(dog, game, random);
    assert.equal(dog.mtame, 4);
    assert.equal(EDOG(dog).abuse, 2);
    assert.deepEqual(random.bounds, ['rn2(4)']);
    assert.equal(lines(), 'The little dog growls!');
    setProperty(CONFLICT, false);

    // Aggravate monster halves it the same way: 4 / 2 is 2, and the roll is
    // the largest rn2(2) allows.
    setProperty(AGGRAVATE_MONSTER, true);
    random = rolls([1]);
    await abuse_dog(dog, game, random);
    assert.equal(dog.mtame, 2);
    assert.equal(EDOG(dog).abuse, 3);
    assert.deepEqual(random.bounds, ['rn2(2)']);
    assert.equal(lines(), 'The little dog yelps!');
    setProperty(AGGRAVATE_MONSTER, false);

    // dog.c:1381's `mtmp->mtame &&` short-circuit. A pet whose tameness has
    // just reached 0 growls without any draw: rn2(0) is never asked for.
    const last = pet(PM_LITTLE_DOG, { mtame: 1 });
    random = rolls([]);
    await abuse_dog(last, game, random);
    assert.equal(last.mtame, 0);
    // dog.c:1372-1373 raise abuse only while the pet is still tame.
    assert.equal(EDOG(last).abuse, 0);
    assert.deepEqual(random.bounds, []);
    assert.equal(lines(), 'The little dog growls!');

    // dog.c:1364-1365. A monster that is not tame returns before any change.
    const stray = pet(PM_JACKAL, { mtame: 0 });
    random = rolls([]);
    await abuse_dog(stray, game, random);
    assert.equal(stray.mtame, 0);
    assert.equal(EDOG(stray).abuse, 0);
    assert.deepEqual(random.bounds, []);
    assert.equal(lines(), '');
});

test('abuse_dog stays silent for a pet that is leaving the level', async () => {
    await hero();
    // dog.c:1380. mx == 0 marks a migrating pet; it loses tameness but
    // makes no sound, spends no draw and gets no newsym().
    const leaving = pet(PM_LITTLE_DOG, { mx: 0, my: 0 });
    const random = rolls([]);
    await abuse_dog(leaving, game, random);
    assert.equal(leaving.mtame, 9);
    assert.equal(EDOG(leaving).abuse, 1);
    assert.deepEqual(random.bounds, []);
    assert.equal(lines(), '');
});

test('growl and yelp roll rn2(35) into h_sounds when hallucinating', async () => {
    await hero();
    setProperty(HALLUC, true);

    // sounds.c:410-411. ROLL_FROM(h_sounds) is h_sounds[rn2(35)]. Roll 0 is
    // the table's first entry, "beep" (sounds.c:342). The hallucinated
    // Monnam() comes from the display stream, so only the verb is pinned.
    let random = rolls([0]);
    await growl(pet(PM_LITTLE_DOG), game, random);
    assert.deepEqual(random.bounds, ['rn2(35)']);
    assert.match(lines(), /^The .+ beeps!$/u);

    // sounds.c:436-437, the same draw in yelp(). Roll 34 is the last entry,
    // "warble" (sounds.c:347), so an off-by-one in the bound would miss it.
    // The pony is MS_NEIGH, which yelp()'s switch has no case for; the
    // hallucination arm bypasses that switch and lets it warble.
    random = rolls([34]);
    await yelp(pet(PM_PONY), game, random);
    assert.deepEqual(random.bounds, ['rn2(35)']);
    assert.match(lines(), /^The .+ warbles!$/u);

    // sounds.c:406 and :432. Both guards sit above the draw: a lichen is
    // MS_SILENT, which growl() rejects and whose msound of 0 yelp() rejects.
    random = rolls([]);
    await growl(pet(PM_LICHEN), game, random);
    await yelp(pet(PM_LICHEN), game, random);
    assert.deepEqual(random.bounds, []);
    assert.equal(lines(), '');

    setProperty(HALLUC, false);
});

test('growl wakes within 18 * mlevel and yelp within 12 * mlevel', async () => {
    await hero();
    // A little dog is LVL(2, ...) at monsters.h:229, so sounds.c:421 gives
    // growl() a wake_nearto() distance of 36 and sounds.c:470 gives yelp()
    // 24. mon.c wake_nearto_core() wakes a monster whose dist2() is below
    // the distance, so sleepers at squared distances 16, 25 and 36 from the
    // pet separate the two: growl wakes the first two and yelp only the
    // first. The sleepers sit on the pet's row, on whichever side has room.
    const dog = pet(PM_LITTLE_DOG);
    const side = dog.mx < 40 ? 1 : -1;
    const at16 = sleeper(dog.mx + 4 * side, dog.my);
    const at25 = sleeper(dog.mx + 5 * side, dog.my);
    const at36 = sleeper(dog.mx + 6 * side, dog.my);

    await growl(dog);
    assert.equal(lines(), 'The little dog growls!');
    assert.equal(Boolean(at16.msleeping), false);
    assert.equal(Boolean(at25.msleeping), false);
    assert.equal(Boolean(at36.msleeping), true);

    at16.msleeping = 1;
    at25.msleeping = 1;
    await yelp(dog);
    assert.equal(lines(), 'The little dog yelps!');
    assert.equal(Boolean(at16.msleeping), false);
    assert.equal(Boolean(at25.msleeping), true);
    assert.equal(Boolean(at36.msleeping), true);
});

test('yelp picks a verb by msound and softens it when deaf', async () => {
    await hero();

    // sounds.c:441-468, the yelp verbs a hearing hero gets.
    await yelp(pet(PM_KITTEN)); /* MS_MEW */
    assert.equal(lines(), 'The kitten yowls!');
    await yelp(pet(PM_LITTLE_DOG)); /* MS_BARK */
    assert.equal(lines(), 'The little dog yelps!');

    // sounds.c:433-434. A species whose msound has no case leaves yelp_verb
    // unset, so nothing is printed. The pony is MS_NEIGH, which growl_sound()
    // covers but yelp()'s switch does not.
    await yelp(pet(PM_PONY));
    assert.equal(lines(), '');

    // sounds.c:429-430. msound 0 is MS_SILENT, and yelp() returns on it.
    await yelp(pet(PM_LICHEN));
    assert.equal(lines(), '');

    // A deaf hero sees the gesture instead of hearing the cry. The draw is
    // unchanged; only the verb differs.
    setProperty(DEAF, true);
    await yelp(pet(PM_KITTEN));
    assert.equal(lines(), 'The kitten arches!');
    await yelp(pet(PM_LITTLE_DOG));
    assert.equal(lines(), 'The little dog recoils!');
    setProperty(DEAF, false);

    // sounds.c:429. helpless() -- asleep or unable to move -- silences yelp()
    // before the verb is chosen.
    await yelp(pet(PM_LITTLE_DOG, { msleeping: 1 }));
    assert.equal(lines(), '');
});

test('growl prints for a visible monster and skips MS_SILENT', async () => {
    await hero();

    await growl(pet(PM_LITTLE_DOG));
    assert.equal(lines(), 'The little dog growls!');
    await growl(pet(PM_KITTEN));
    assert.equal(lines(), 'The kitten hisses!');
    // MS_NEIGH reaches growl() even though yelp() has no case for it.
    await growl(pet(PM_PONY));
    assert.equal(lines(), 'The pony neighs!');
    // sounds.c:405. MS_SILENT returns before the verb, unlike growl_sound(),
    // which would have answered "commotion".
    await growl(pet(PM_LICHEN));
    assert.equal(lines(), '');
    // A newt is MS_SILENT too, so the guard is about msound, not the species.
    await growl(pet(PM_NEWT));
    assert.equal(lines(), '');
    // sounds.c:405, the helpless() half of the same guard.
    await growl(pet(PM_LITTLE_DOG, { mcanmove: 0 }));
    assert.equal(lines(), '');
});
