// Source-pinned checks for polyself.c polyself() and were_beastie().  The
// recorded raven recipe covers the impure production caller; these checks pin
// the selector's pure conversion table and the order-sensitive source arms.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    PM_BROWN_MOLD,
    PM_COYOTE,
    PM_FOX,
    PM_GRAY_DRAGON,
    PM_GREEN_DRAGON,
    PM_GIANT_RAT,
    PM_HUMAN_WEREJACKAL,
    PM_HUMAN_WEREWOLF,
    PM_JACKAL,
    PM_RABID_RAT,
    PM_SEWER_RAT,
    PM_STONE_GIANT,
    PM_WARG,
    PM_WEREJACKAL,
    PM_WERERAT,
    PM_WEREWOLF,
    PM_WINTER_WOLF,
    PM_WINTER_WOLF_CUB,
    PM_WOLF,
    M2_HUMAN,
    NON_PM,
} from '../js/monsters.js';
import { armor_to_dragon, polymon } from '../js/polyself.js';
import { were_beastie } from '../js/were.js';
import { your_race } from '../js/mondata.js';
import { strstri } from '../js/hacklib.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { InMemoryStorage } from '../js/storage.js';
import { OBJ_INVENT, W_ARMU } from '../js/const.js';
import {
    ARMOR_CLASS,
    GRAY_DRAGON_SCALE_MAIL,
    GREEN_DRAGON_SCALES,
    STRANGE_OBJECT,
    T_SHIRT,
} from '../js/objects.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/polyself.c', 'utf8');
const JS_SOURCE = readFileSync('js/polyself.js', 'utf8');
const C_START = C_SOURCE.indexOf('polyself(int psflags)');
const C_END = C_SOURCE.indexOf('\n}\n\n/* (try to) make a mntmp', C_START) + 2;
const JS_START = JS_SOURCE.indexOf('export async function polyself(');
const JS_END = JS_SOURCE.indexOf('\n}\n\nconst HUMANOID_PARTS', JS_START) + 2;
const C_FUNCTION = C_SOURCE.slice(C_START, C_END);
const JS_FUNCTION = JS_SOURCE.slice(JS_START, JS_END);

test('were_beastie maps every C were.c family member and rejects others', () => {
    const ratForms = [PM_WERERAT, PM_SEWER_RAT, PM_GIANT_RAT, PM_RABID_RAT];
    const jackalForms = [
        PM_WEREJACKAL, PM_JACKAL, PM_FOX, PM_COYOTE,
    ];
    const wolfForms = [
        PM_WEREWOLF, PM_WOLF, PM_WARG, PM_WINTER_WOLF,
        PM_WINTER_WOLF_CUB,
    ];
    for (const pm of ratForms) assert.equal(were_beastie(pm), PM_WERERAT);
    for (const pm of jackalForms) {
        assert.equal(were_beastie(pm), PM_WEREJACKAL);
    }
    for (const pm of wolfForms) assert.equal(were_beastie(pm), PM_WEREWOLF);
    assert.equal(were_beastie(PM_HUMAN_WEREWOLF), NON_PM);
    assert.equal(were_beastie(PM_HUMAN_WEREJACKAL), NON_PM);
});

test('armor_to_dragon maps source scale armor and non-dragon defaults', () => {
    assert.equal(armor_to_dragon(GRAY_DRAGON_SCALE_MAIL), PM_GRAY_DRAGON);
    assert.equal(armor_to_dragon(GREEN_DRAGON_SCALES), PM_GREEN_DRAGON);
    assert.equal(armor_to_dragon(STRANGE_OBJECT), NON_PM);
});

test('polyself keeps role admission, race admission, and strstri result semantics',
    () => {
    // polyself.c:604-607 admits the role monster separately from the race
    // test.  These direct source helpers pin the two bit masks and the
    // negative result consumed by the wizard cleric exception.
    const state = { urace: { selfmask: M2_HUMAN } };
    assert.equal(your_race({ mflags2: M2_HUMAN }, state), true);
    assert.equal(your_race({ mflags2: 0 }, state), false);
    assert.equal(strstri('aligned cleric', 'aligned'), 0);
    assert.ok(strstri('cleric', 'aligned') < 0);
});

test('polyself uses the role monster and original form in production', async () => {
    const base = JSON.parse(readFileSync(
        'recipes/polyself.c/polyself-raven-independent.session.json', 'utf8',
    )).segments[0];

    // A Wizard's role monster is not its human race.  C's gu.urole.mnum
    // admission therefore reaches newman() for this valid role name.
    await runSegment({ ...base, moves: '#polyself\nwizard\n' });
    assert.match(game.nhDisplay.topMessage, /^You feel like a new /u);

    // After an independent raven transformation, wizard mode compares the
    // requested role with u.umonster (the original form), so it rehumanizes.
    await runSegment({
        ...base,
        moves: '#polyself\nraven\n  #polyself\nwizard\n',
    });
    assert.equal(game.u.umonnum, game.u.umonster);
    assert.match(game.nhDisplay.topMessage, /^You return to human form!/u);
});

test('the seed4500 polymorph reaches break_armor and removes nohands gear',
    async () => {
    // The fixed-workload Knight witness reaches polyself.c:1248-1271 after a
    // polymorph into a brown mold.  Replay only through the next stable
    // command boundary: the source branch must clear gloves, shield, helmet,
    // and boots before polymon() continues its post-transformation work.  The
    // returned NethackGame is a capture wrapper; the canonical state remains
    // in the shared game object used by runSegment().
    const recording = JSON.parse(readFileSync(
        new URL('../sessions/holdout/seed4500-knight-coverage.session.json',
            import.meta.url),
        'utf8',
    ));
    const segment = recording.segments[0];
    const end = 1460;
    let boundary = null;
    const replay = await runSegment({
        ...segment,
        moves: segment.steps.slice(1, end)
            .map(({ key }) => key ?? '').join(''),
        storage: new InMemoryStorage(),
    }, { onBoundary: (error) => { boundary ??= error; } });

    assert.equal(boundary, null,
        'break_armor continues through the saved production prefix');
    assert.equal(replay.getScreens().length, end,
        'the source-matching prefix emits one screen per step');
    assert.equal(game.u.umonnum, PM_BROWN_MOLD,
        'the witness reaches the intended nohands polymorph');
    assert.equal(game.youmonst.data.pmidx, PM_BROWN_MOLD,
        'the canonical monster form is the selected brown mold');
    for (const slot of ['uarm', 'uarmc', 'uarmh', 'uarms',
        'uarmg', 'uarmf', 'uarmu']) {
        assert.equal(game[slot] ?? null, null,
            `${slot} is no longer worn`);
    }
});

test('break_armor consumes a worn shirt through the inventory lifecycle',
    async () => {
    // polyself.c:1174-1201.  A breakarm form destroys uarmu with useup()
    // while the slot is still worn; useupall must therefore invoke the
    // canonical setnotworn hook before removing the inventory object.
    const recording = JSON.parse(readFileSync(
        new URL('../sessions/holdout/seed4500-knight-coverage.session.json',
            import.meta.url),
        'utf8',
    ));
    await runSegment({
        ...recording.segments[0],
        moves: recording.segments[0].steps.slice(1, 3)
            .map(({ key }) => key ?? '').join(''),
        storage: new InMemoryStorage(),
    });
    const shirt = {
        oclass: ARMOR_CLASS,
        otyp: T_SHIRT,
        where: OBJ_INVENT,
        quan: 1,
        owornmask: W_ARMU,
        nobj: game.invent,
    };
    game.invent = shirt;
    game.uarmu = shirt;
    // Directly invoking polymon() is the initialized-state fixture here; a
    // fixed response keeps its ordinary pline waits from depending on the
    // runSegment input queue.
    game.nhDisplay.readKey = async () => 32;
    await polymon(PM_STONE_GIANT, game);
    assert.equal(game.uarmu, null, 'breakarm clears the worn shirt slot');
    let stillCarried = false;
    for (let obj = game.invent; obj; obj = obj.nobj)
        stillCarried ||= obj === shirt;
    assert.equal(stillCarried, false,
        'useup removes the destroyed shirt from the inventory chain');
    assert.equal(shirt.owornmask, 0,
        'useupall clears worn state before deallocation');
});
test('polyself keeps the C early guards, selector, and final gate in order', () => {
    assert.ok(C_START >= 0 && C_END > C_START);
    assert.ok(JS_START >= 0 && JS_END > JS_START);
    assert.ok(C_FUNCTION.length > 7000, 'the selected C function is whole');
    assert.match(C_FUNCTION, /if \(Unchanging\)[\s\S]*rn2\(20\)/u);
    assert.match(C_FUNCTION, /name_to_mon\(buf, &gvariant\)[\s\S]*name_to_monclass/u);
    assert.match(C_FUNCTION, /do \{[\s\S]*rn1\(SPECIAL_PM - LOW_PM, LOW_PM\)/u);
    assert.match(JS_FUNCTION, /if \(Unchanging\(state\)\)[\s\S]*rn2\(20\)/u);
    assert.match(JS_FUNCTION, /name_to_monplus\(buf[\s\S]*name_to_monclass/u);
    assert.match(JS_FUNCTION, /rn1\(M\.SPECIAL_PM - M\.LOW_PM, M\.LOW_PM\)/u);
    assert.match(JS_FUNCTION, /were_beastie\(mntmp\)[\s\S]*counter_were/u);
    assert.match(JS_FUNCTION, /await newman\(state\)[\s\S]*await polymon/u);
    assert.doesNotMatch(JS_FUNCTION, /throw new UnsupportedPolyselfError/u);
});
