// Direct tests for dog.c abuse_dog() and the sounds.c verbs it reaches,
// growl() and yelp(). The three recipes/pet-abuse-*.session.json fresh
// differentials cover what a live game shows: a landed hit on a little dog
// that yelps and then flees, one that growls, and one on a pony, whose
// MS_NEIGH has no yelp verb. The arms below are the ones a recording cannot
// reach cheaply -- the whole growl_sound() table, deafness, the halving arm,
// and the pet that is midway off the level.

import assert from 'node:assert/strict';
import test from 'node:test';

import { abuse_dog } from '../js/dog.js';
import { AGGRAVATE_MONSTER, CONFLICT, DEAF, EDOG } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { newMonster } from '../js/monst.js';
import { growl, growl_sound, yelp } from '../js/sounds.js';
import {
    PM_GNOME,
    PM_JACKAL,
    PM_KITTEN,
    PM_PONY,
    PM_LITTLE_DOG,
    PM_LICHEN,
    PM_NEWT,
} from '../js/monsters.js';

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

    // dog.c:1367. Ordinary abuse decrements mtame by one and, for a pet that
    // is still tame and not a minion, raises EDOG()->abuse.
    const dog = pet(PM_LITTLE_DOG);
    // rn2(9) on the decremented tameness picks yelp() over growl(); with the
    // real stream this is 8 chances in 9, and the recipes cover both outcomes.
    // Here the state changes are what is pinned.
    await abuse_dog(dog);
    assert.equal(dog.mtame, 9);
    assert.equal(EDOG(dog).abuse, 1);
    // MS_BARK yelps or growls; either verb agrees with vtense() by adding an s.
    assert.match(lines(), /^The little dog (yelps|growls)!/u);

    // dog.c:1366. Conflict halves tameness instead, and schar division
    // truncates toward zero.
    setProperty(CONFLICT, true);
    await abuse_dog(dog);
    assert.equal(dog.mtame, 4);
    lines(); /* the complaint is asserted above; here only mtame matters */
    setProperty(CONFLICT, false);

    // Aggravate monster halves it the same way.
    setProperty(AGGRAVATE_MONSTER, true);
    await abuse_dog(dog);
    assert.equal(dog.mtame, 2);
    lines();
    setProperty(AGGRAVATE_MONSTER, false);

    // dog.c:1363-1364. A monster that is not tame returns before any change.
    const stray = pet(PM_JACKAL, { mtame: 0 });
    await abuse_dog(stray);
    assert.equal(stray.mtame, 0);
    assert.equal(EDOG(stray).abuse, 0);
    assert.equal(lines(), '');
});

test('abuse_dog stays silent for a pet that is leaving the level', async () => {
    await hero();
    // dog.c:1378-1379. mx == 0 marks a migrating pet; it loses tameness but
    // makes no sound and gets no newsym().
    const leaving = pet(PM_LITTLE_DOG, { mx: 0, my: 0 });
    await abuse_dog(leaving);
    assert.equal(leaving.mtame, 9);
    assert.equal(EDOG(leaving).abuse, 1);
    assert.equal(lines(), '');
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
