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
import { autokey, doopen_indir } from '../js/lock.js';
import { is_magic_key } from '../js/artifacts.js';
import { ART_MASTER_KEY_OF_THIEVERY } from '../js/artifacts.js';
import { PM_ROGUE, PM_WIZARD } from '../js/monsters.js';
import {
    CREDIT_CARD,
    LOCK_PICK,
    SKELETON_KEY,
} from '../js/objects.js';

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
    // drawing.c defsyms: a closed door is S_vcdoor/S_hcdoor, '+' in either
    // orientation. This one sits in the room's west wall.
    assert.equal(door.disp_ch, '+');

    const result = await doopen_indir(
        x, y, game, scriptedPull(events, FOLDED_THRESHOLD - 1),
    );

    assert.deepEqual(events, ['rnl(20)', 'message(The door opens.)']);
    // struct rm's mask has two spellings in this port; both readers have to
    // see the open door.
    assert.equal(door.flags, D_ISOPEN);
    assert.equal(door.doormask, D_ISOPEN);
    // lock.c:914's feel_newsym() is what repaints the square, and the repaint
    // is the whole visible result of the pull: S_vodoor, the open door in a
    // vertical wall, is '-'. Without it the square keeps drawing '+' while the
    // mask says the door is open, which changes every later screen.
    assert.equal(door.disp_ch, '-');
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

// --- is_magic_key() tests ---

test('is_magic_key returns false for a non-artifact', () => {
    // A plain lock pick is never a magic key regardless of bless/curse state.
    // C ref: artifact.c:2778 checks is_art(obj, ART_MASTER_KEY_OF_THIEVERY)
    // first; a non-artifact has oartifact 0, so the test fails immediately.
    const obj = { otyp: LOCK_PICK, oartifact: 0, cursed: false, blessed: true };
    const state = { youmonst: {}, urole: { mnum: PM_ROGUE } };
    assert.equal(is_magic_key(state.youmonst, obj, state), false);
});

test('is_magic_key respects role-dependent bless/curse rules', () => {
    // C ref: artifact.c:2779-2783. For a rogue, non-cursed suffices; for a
    // non-rogue, the key must be blessed.
    const mkObj = (cursed, blessed) => ({
        otyp: SKELETON_KEY,
        oartifact: ART_MASTER_KEY_OF_THIEVERY,
        cursed,
        blessed,
    });
    const rogueState = {
        youmonst: {},
        urole: { mnum: PM_ROGUE },
    };
    // Rogue: non-cursed is magic; cursed is not.
    assert.equal(
        is_magic_key(rogueState.youmonst, mkObj(false, false), rogueState),
        true,
        'rogue uncursed',
    );
    assert.equal(
        is_magic_key(rogueState.youmonst, mkObj(true, false), rogueState),
        false,
        'rogue cursed',
    );
    // Non-rogue: must be blessed.
    const wizState = {
        youmonst: {},
        urole: { mnum: PM_WIZARD },
    };
    assert.equal(
        is_magic_key(wizState.youmonst, mkObj(false, true), wizState),
        true,
        'non-rogue blessed',
    );
    assert.equal(
        is_magic_key(wizState.youmonst, mkObj(false, false), wizState),
        false,
        'non-rogue uncursed unblessed',
    );
});

// --- autokey() tests ---

test('autokey prefers skeleton key over lock pick over credit card', async () => {
    // C ref: lock.c:337-343. The return priority is key > pick > card, and
    // within each type the first mundane item found wins.
    await runSegment({
        seed: DOOR_SEED,
        datetime: DOOR_DATETIME,
        nethackrc: DOOR_RC,
        moves: '',
    });
    // Clear inventory and build a chain of three tools.
    const card = { otyp: CREDIT_CARD, oartifact: 0, nobj: null };
    const pick = { otyp: LOCK_PICK, oartifact: 0, nobj: card };
    const key = { otyp: SKELETON_KEY, oartifact: 0, nobj: null };

    // With all three, autokey chooses the skeleton key.
    game.invent = { ...key, nobj: pick };
    assert.equal(autokey(true, game).otyp, SKELETON_KEY, 'key wins');

    // Without a key, it chooses the lock pick.
    game.invent = pick;
    assert.equal(autokey(true, game).otyp, LOCK_PICK, 'pick wins');

    // Without a pick, it chooses the credit card.
    game.invent = card;
    assert.equal(autokey(true, game).otyp, CREDIT_CARD, 'card wins');

    // When opening is false, credit cards are excluded.
    assert.equal(autokey(false, game), null, 'card excluded when not opening');

    // Empty inventory returns null.
    game.invent = null;
    assert.equal(autokey(true, game), null, 'empty inventory');
});

// --- doopen_indir autounlock wiring ---

test('doopen_indir with empty inventory skips pick_lock for a locked door',
    async () => {
    // C ref: lock.c:876-883. A locked door with AUTOUNLOCK_APPLY_KEY set
    // calls autokey(true) to find a tool. With no tool in inventory,
    // pick_lock is never called and doopen_indir returns ECMD_OK after
    // printing "This door is locked.". This avoids the ynq terminal prompt.
    const { x, y, door } = await closedDoorBesideHero();
    door.flags = D_LOCKED;
    door.doormask = D_LOCKED;
    // No unlocking tool in inventory, so autokey(true) returns null and the
    // autounlock path falls through without calling pick_lock.
    const savedInvent = game.invent;
    game.invent = null;
    const events = [];

    const result = await doopen_indir(
        x, y, game, scriptedPull(events, 0),
    );

    // The "This door is locked." message fires, but autokey finds no tool,
    // so the function returns ECMD_OK without prompting.
    assert.deepEqual(events, ['message(This door is locked.)']);
    assert.equal(result, ECMD_OK);
    game.invent = savedInvent;
});
