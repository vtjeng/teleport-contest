import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_CON,
    A_DEX,
    A_STR,
    DOOR,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    ECMD_OK,
    ECMD_TIME,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { doopen_indir } from '../js/lock.js';

// Seed 9400016 puts a plain closed door one square west of a Valkyrie's
// starting position, which is the state hack.c test_move()'s autoopen arm
// hands to doopen_indir(). The scan that chose it read generated levels; no
// recorded session was consulted.
const DOOR_SEED = 9400016;
const DOOR_DATETIME = '20310203040506';
const DOOR_RC = [
    'OPTIONS=name:Doorway,role:Valkyrie,race:human,gender:female,'
    + 'align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

// C ref: lock.c:904, `rnl(20) < (ACURRSTR + ACURR(A_DEX) + ACURR(A_CON)) / 3`.
// Strength 68 is acurr()'s encoding of 18/50, which acurrstr() folds to 20;
// with Dexterity and Constitution at their floor of 3 the threshold is
// (20 + 3 + 3) / 3 == 8. Reading the raw 68 instead would give 24, so any roll
// between 8 and 23 tells the two apart.
const FOLDED_THRESHOLD = 8;
const RAW_STRENGTH_THRESHOLD = 24;

async function closedDoorBesideHero({ foldedStrength = true } = {}) {
    await runSegment({
        seed: DOOR_SEED,
        datetime: DOOR_DATETIME,
        nethackrc: DOOR_RC,
        moves: '',
    });
    const x = game.u.ux - 1;
    const y = game.u.uy;
    const door = game.level.at(x, y);
    assert.equal(door.typ, DOOR, 'the chosen seed still places a door here');
    assert.equal(door.flags, D_CLOSED, 'the door is closed and unlocked');
    if (foldedStrength) {
        // 18/50 Strength with the lowest Dexterity and Constitution acurr()
        // allows, so the folded and raw thresholds are far apart.
        game.u.acurr.a[A_STR] = 68;
        game.u.acurr.a[A_DEX] = 3;
        game.u.acurr.a[A_CON] = 3;
    }
    return { x, y, door };
}

function scriptedPull(events, rnlResult) {
    return {
        message: (text) => {
            events.push(`message(${text})`);
        },
        random: {
            rnl(bound) {
                events.push(`rnl(${bound})`);
                return rnlResult;
            },
            rn2(bound) {
                events.push(`rn2(${bound})`);
                // attrib.c exercise() adds 1 when rn2(19) beats the
                // attribute; 18 is the largest value rn2(19) can return.
                return 18;
            },
        },
    };
}

test('a winning pull opens the door for every reader of the mask', async () => {
    const { x, y, door } = await closedDoorBesideHero();
    const events = [];
    game.vision_full_recalc = 0;

    const result = await doopen_indir(
        x, y, game, scriptedPull(events, FOLDED_THRESHOLD - 1),
    );

    assert.deepEqual(events, ['rnl(20)', 'message(The door opens.)']);
    // struct rm's mask has two spellings in this port; both readers have to
    // see the open door.
    assert.equal(door.flags, D_ISOPEN);
    assert.equal(door.doormask, D_ISOPEN);
    // recalc_block_point() on a square the hero can currently see schedules
    // moveloop_core()'s vision_recalc(0).
    assert.equal(game.vision_full_recalc, 1);
    assert.equal(result, ECMD_TIME);
});

test('the roll uses folded Strength, not acurr()\'s raw encoding', async () => {
    const { x, y, door } = await closedDoorBesideHero();
    const events = [];

    // Between the two thresholds: C keeps the door shut, and reading raw
    // Strength would open it.
    await doopen_indir(
        x, y, game, scriptedPull(events, RAW_STRENGTH_THRESHOLD - 1),
    );

    assert.equal(door.flags, D_CLOSED);
    // The mask alone is satisfied by any path that leaves the door shut,
    // including one that never rolls or never prints. The event list pins the
    // folded threshold, the draw order and the failure message together.
    assert.deepEqual(events, [
        'rnl(20)', 'rn2(19)', 'message(The door resists!)',
    ]);
});

test('a failed pull exercises Strength before it prints', async () => {
    // The seed's own attributes, St:17 Dx:11 Co:18, put the threshold at 15
    // and leave Strength low enough for rn2(19) to beat it.
    const { x, y, door } = await closedDoorBesideHero({
        foldedStrength: false,
    });
    const events = [];
    const exerciseBefore = game.u.aexe[A_STR];

    const result = await doopen_indir(x, y, game, scriptedPull(events, 15));

    // lock.c:917-919 runs exercise(A_STR, TRUE) ahead of set_msg_xy() and the
    // message, so the rn2(19) it draws lands between the roll and the line.
    assert.deepEqual(events, [
        'rnl(20)', 'rn2(19)', 'message(The door resists!)',
    ]);
    assert.equal(game.u.aexe[A_STR], exerciseBefore + 1);
    assert.equal(door.flags, D_CLOSED);
    assert.equal(result, ECMD_TIME);
});

// C ref: lock.c:855-896. A mask without D_CLOSED never reaches the roll: the
// switch names the door and the function returns. Only the default arm is
// reachable from a walk, because monmove.c closed_door() admits D_LOCKED and
// D_CLOSED alone; the other three arrive through the unported `#open` command
// and are pinned here because no recording can reach them.
test('a door that is not closed is named instead of pulled at', async () => {
    const cases = [
        // The live arm. Its message is what a hero walking into a locked door
        // sees, and the fresh recordings in run-closed-door-autoopen.mjs
        // compare it against C.
        [D_LOCKED, 'This door is locked.'],
        // C switches on the whole mask rather than on the door-state bits, so
        // a trap bit changes which arm is taken. D_LOCKED | D_TRAPPED is a
        // poor witness for that: it lands on `default` whether or not the bit
        // is masked off. These two are the discriminating pair -- masking the
        // trap bit would send them to the broken and already-open arms, and
        // C sends them to `default`.
        [D_LOCKED | D_TRAPPED, 'This door is locked.'],
        [D_BROKEN | D_TRAPPED, 'This door is locked.'],
        [D_ISOPEN | D_TRAPPED, 'This door is locked.'],
        [D_BROKEN, 'This door is broken.'],
        [D_NODOOR, 'This doorway has no door.'],
        [D_ISOPEN, 'This door is already open.'],
    ];
    for (const [mask, line] of cases) {
        const { x, y, door } = await closedDoorBesideHero();
        door.flags = mask;
        door.doormask = mask;
        const events = [];

        // rnl() would return 0 and open the door if the roll were reached, so
        // an empty draw list is the proof that the switch returned first.
        const result = await doopen_indir(x, y, game, scriptedPull(events, 0));

        assert.deepEqual(events, [`message(${line})`], `mask ${mask}`);
        assert.equal(door.flags, mask, `mask ${mask} unchanged`);
        // lock.c returns `res` here, which is ECMD_OK unless the newsym()
        // block above learned something; this port does not model that bump,
        // and hack.c:1104 discards the value on the walking path either way.
        assert.equal(result, ECMD_OK, `mask ${mask} return`);
    }
});

test('doopen_indir rejects a substitution it would never read', async () => {
    const { x, y } = await closedDoorBesideHero();
    await assert.rejects(
        () => doopen_indir(x, y, game, { messsage: () => {} }),
        /does not read env\.messsage/u,
    );
});
