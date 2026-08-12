import assert from 'node:assert/strict';
import test from 'node:test';

import { doapply } from '../js/apply.js';
import { get_adjacent_loc } from '../js/cmd.js';
import {
    BLINDED,
    DBWALL,
    DB_SOUTH,
    DRAWBRIDGE_UP,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    ECMD_OK,
    ECMD_TIME,
    HWALL,
    ROOM,
    TT_BEARTRAP,
    TT_PIT,
    u_at,
} from '../js/const.js';
import { glyph_is_object } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PICKLOCK_DID_NOTHING,
    PICKLOCK_DID_SOMETHING,
    PICKLOCK_LEARNED_SOMETHING,
    UnsupportedLockError,
    pick_lock,
    reset_pick,
} from '../js/lock.js';
import { newMonster } from '../js/monst.js';
import { M1_NOHANDS, S_FELINE } from '../js/monsters.js';
import { CREDIT_CARD, LOCK_PICK, SKELETON_KEY } from '../js/objects.js';
import { S_darkroom, S_room } from '../js/symbols.js';
import {
    APPLY_KEY,
    ESCAPE_KEY,
    LOCK_PICK_SLOT,
    loadApplyLockPickRecipe,
} from './run-apply-lock-pick.mjs';

function topLine() {
    return game.nhDisplay.grid[0].map(({ ch }) => ch).join('').trimEnd();
}

// The top line a call made outside moveloop_core() produced. Nothing has
// flushed the screen yet, so this is the text the next flush would paint.
function pendingTopLine() {
    return game._pending_message ?? '';
}

// Locate a matrix segment by the seed and the keys it types, so reordering the
// matrix cannot silently point a test at a different case.
function segmentFor(seed, moves) {
    const found = loadApplyLockPickRecipe().segments.find(
        (segment) => segment.seed === seed && segment.moves === `.${moves}.`,
    );
    assert.ok(found, `the matrix contains seed ${seed} typing ${moves}`);
    return found;
}

// Replay the walk in front of one matrix segment and stop there, so the hero
// stands where its apply starts from and the input queue is empty again. The
// caller then pushes the keys the case needs and calls into the port directly.
async function standBeside(seed, moves, walk) {
    await runSegment({ ...segmentFor(seed, moves), moves: `.${walk}` });
}

// Type the object letter and the direction into the queue doapply() reads.
function answer(...keys) {
    for (const key of keys) game.nhDisplay.pushKey(key.charCodeAt(0));
}

// The lock pick u_init.c gives every Rogue, found by walking obj.h's nobj
// chain rather than by trusting the inventory letter.
function lockPick() {
    for (let obj = game.invent; obj; obj = obj.nobj) {
        if (obj.otyp === LOCK_PICK) return obj;
    }
    assert.fail('the Rogue starts with a lock pick');
    return null;
}

// The square the first matrix segment's direction key names: one north of the
// hero, holding the door mklev.c dosdoor() rolled open.
function doorNorth() {
    return game.level.at(game.u.ux, game.u.uy - 1);
}

test('applying a lock pick to an open door spends the turn', async () => {
    // lock.c:598-600 through apply.c:4288. The arm answers
    // PICKLOCK_LEARNED_SOMETHING, which is nonzero, so doapply() maps it to
    // ECMD_TIME and the turn counter moves. Each replay stops one key before
    // the wait that closes the matrix segment, because that wait's turn
    // clears the top line again.
    const keys = `l${APPLY_KEY}${LOCK_PICK_SLOT}k`;
    const segment = segmentFor(5200108, keys);
    await runSegment({ ...segment, moves: '.l' });
    const before = game.moves;
    await runSegment({ ...segment, moves: `.${keys}` });
    assert.equal(topLine(), 'You cannot lock an open door.');
    assert.equal(game.moves, before + 1);
});

test('applying a lock pick to a doorway names the doorway', async () => {
    // lock.c:595-597, the arm above the live one. Both answer
    // PICKLOCK_LEARNED_SOMETHING, so only the message separates them.
    const keys = `l${APPLY_KEY}${LOCK_PICK_SLOT}l`;
    await runSegment({
        ...segmentFor(5200001, keys), moves: `.${keys}`,
    });
    assert.equal(topLine(), 'This doorway has no door.');
});

test('a door opened by walking into it reads as open when the pick arrives',
    async () => {
    // lock.c doopen_indir() writes D_ISOPEN on a successful roll, and
    // pick_lock() reads the same field one command later. The walk and the
    // apply are the two halves this segment exists to join.
    const keys = `hhj${APPLY_KEY}${LOCK_PICK_SLOT}j`;
    await runSegment({
        ...segmentFor(5200006, keys), moves: `.${keys}`,
    });
    assert.equal(topLine(), 'You cannot lock an open door.');
});

test('cancelling the direction prompt costs no time', async () => {
    // cmd.c:3936-3939. getdir() answers 0 for a quitchar, so
    // get_adjacent_loc() prints Never_mind and pick_lock() returns
    // PICKLOCK_DID_NOTHING, which doapply() maps to ECMD_OK.
    await runSegment({
        ...segmentFor(5200001, `${APPLY_KEY}${LOCK_PICK_SLOT}${ESCAPE_KEY}`),
        moves: '.',
    });
    const before = game.moves;
    answer(LOCK_PICK_SLOT, ESCAPE_KEY);
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(pendingTopLine(), 'Never mind.');
    assert.equal(game.moves, before);
});

test('pick_lock answers the three otyps doapply() sends it', async () => {
    // apply.c:4285-4287 is one case label over three object types, and
    // nothing between there and the doormask switch reads which one arrived.
    for (const otyp of [LOCK_PICK, CREDIT_CARD, SKELETON_KEY]) {
        await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
        lockPick().otyp = otyp;
        answer(LOCK_PICK_SLOT, 'k');
        assert.equal(await doapply(game), ECMD_TIME, `otyp ${otyp}`);
        assert.equal(pendingTopLine(), 'You cannot lock an open door.');
    }
});

test('the doormask switch reads the whole mask, not one bit', async () => {
    // lock.c:594 switches on door->doormask itself, so a mask carrying any
    // further bit lands on `default`. No generator writes D_ISOPEN | D_TRAPPED
    // -- mklev.c dosdoor() adds D_TRAPPED only to the two closed masks -- so
    // the state is built here to hold the equality test in place.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    doorNorth().flags = D_ISOPEN | D_TRAPPED;
    answer(LOCK_PICK_SLOT, 'k');
    await assert.rejects(
        () => doapply(game),
        (error) => error instanceof UnsupportedLockError
            && error.branch === 'locking or unlocking a door',
    );
});

test('a broken door reports itself and still spends the turn', async () => {
    // lock.c:601-603. sp_lev.c rnddoor() is the only generator that writes
    // D_BROKEN, and no special level this port builds calls it, so the mask
    // is set here directly.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    doorNorth().flags = D_BROKEN;
    answer(LOCK_PICK_SLOT, 'k');
    assert.equal(await doapply(game), ECMD_TIME);
    assert.equal(pendingTopLine(), 'This door is broken.');
});

test('a closed or locked door reaches the unported unlock attempt', async () => {
    // lock.c:604-647, the arm that asks "Unlock it?" and starts the picklock()
    // occupation. Both masks that reach it are ordinary output of mklev.c
    // dosdoor().
    for (const mask of [D_CLOSED, D_LOCKED]) {
        await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
        doorNorth().flags = mask;
        answer(LOCK_PICK_SLOT, 'k');
        await assert.rejects(
            () => doapply(game),
            (error) => error instanceof UnsupportedLockError
                && error.branch === 'locking or unlocking a door',
            `mask ${mask}`,
        );
    }
});

test('a hero in a pit cannot reach over its edge', async () => {
    // lock.c:551-556. The refusal is PICKLOCK_DID_NOTHING, so unlike every
    // other answer from this branch it costs no time.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    game.u.utrap = 1;
    game.u.utraptype = TT_PIT;
    answer(LOCK_PICK_SLOT, 'k');
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(pendingTopLine(), "You can't reach over the edge of the pit.");

    // Held by anything other than a pit, the hero reaches the door as usual.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    game.u.utrap = 1;
    game.u.utraptype = TT_BEARTRAP;
    answer(LOCK_PICK_SLOT, 'k');
    assert.equal(await doapply(game), ECMD_TIME);
    assert.equal(pendingTopLine(), 'You cannot lock an open door.');

    // And an untrapped hero reaches it whatever utraptype happens to hold,
    // because C tests u.utrap first.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    game.u.utrap = 0;
    game.u.utraptype = TT_PIT;
    answer(LOCK_PICK_SLOT, 'k');
    assert.equal(await doapply(game), ECMD_TIME);
    assert.equal(pendingTopLine(), 'You cannot lock an open door.');
});

test('the hero\'s own square stops', async () => {
    // lock.c:429, the container branch: the self key zeroes u.dx and u.dy, so
    // get_adjacent_loc() answers the hero's own position.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    answer(LOCK_PICK_SLOT, '.');
    await assert.rejects(
        () => doapply(game),
        (error) => error instanceof UnsupportedLockError
            && error.branch === "a lock at the hero's own square",
    );
});

test('a square with no door is felt rather than picked', async () => {
    // lock.c:578-593. Every case here is recorded in the matrix; the
    // assertions name the state each one turns on, which the recorded screens
    // show only through the turn counter.

    // Lit room floor south of the hero. display.c:894-897 moves map memory
    // from S_room to S_darkroom because 'dark_room' and colour are both on,
    // so lock.c:584 sees a changed glyph and the attempt costs a turn.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}j`, 'l');
    const floor = game.level.at(game.u.ux, game.u.uy + 1);
    assert.equal(floor.typ, ROOM);
    assert.equal(floor.remembered_glyph.cmap, S_room);
    answer(LOCK_PICK_SLOT, 'j');
    assert.equal(await doapply(game), ECMD_TIME);
    assert.equal(pendingTopLine(), 'You see no door there.');
    assert.equal(floor.remembered_glyph.cmap, S_darkroom);

    // A wall the hero already sees. feel_location() rewrites nothing there --
    // its two tail arms name ROOM and CORR -- so the answer is
    // PICKLOCK_DID_NOTHING and no turn is spent.
    await standBeside(5200108, `${APPLY_KEY}${LOCK_PICK_SLOT}k`, '');
    const wall = game.level.at(game.u.ux, game.u.uy - 1);
    assert.equal(wall.typ, HWALL);
    const wallMemory = wall.remembered_glyph;
    answer(LOCK_PICK_SLOT, 'k');
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(pendingTopLine(), 'You see no door there.');
    assert.equal(wall.remembered_glyph.cmap, wallMemory.cmap);

    // Room floor holding an object, which is _map_location()'s first arm.
    // The object has to stay in map memory: replacing it with floor would
    // both change the cell and wrongly spend the turn.
    await standBeside(5200108, `jj${APPLY_KEY}${LOCK_PICK_SLOT}l`, 'jj');
    const pile = game.level.at(game.u.ux + 1, game.u.uy);
    assert.equal(pile.typ, ROOM);
    assert.ok(game.level.objects[game.u.ux + 1][game.u.uy]);
    answer(LOCK_PICK_SLOT, 'l');
    assert.equal(await doapply(game), ECMD_OK);
    assert.equal(pendingTopLine(), 'You see no door there.');
    assert.equal(glyph_is_object(pile), true);
});

test('a blind hero feels rather than sees', async () => {
    // lock.c:589-592 chooses the verb from Blind. The matrix records this
    // through the 'blind' roleplay conduct; here the hero is blinded in place
    // so the same square answers both ways.
    await standBeside(5200108, `${APPLY_KEY}${LOCK_PICK_SLOT}l`, '');
    game.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    answer(LOCK_PICK_SLOT, 'l');
    assert.equal(await doapply(game), ECMD_TIME);
    assert.equal(pendingTopLine(), 'You feel no door there.');
});

test('a drawbridge wall names the drawbridge instead of the door', async () => {
    // lock.c:588-591. is_drawbridge_wall() answers >= 0 only for a DOOR or a
    // DBWALL beside a drawbridge, and IS_DOOR is already false in this arm, so
    // the square has to be DBWALL. No level this port generates holds a
    // drawbridge and no recordable C case within reach of the port puts one
    // beside the hero, so this builds the pair by hand; the deferred entry
    // pick-lock-drawbridge-message-has-no-fresh-case records that gap.
    for (const blind of [false, true]) {
        await standBeside(5200108, `${APPLY_KEY}${LOCK_PICK_SLOT}k`, '');
        const x = game.u.ux;
        const y = game.u.uy - 1;
        game.level.at(x, y).typ = DBWALL;
        // dbridge.c is_drawbridge_wall() walks the four neighbours looking for
        // a drawbridge whose DB_DIR names this square's side of it.
        const bridge = game.level.at(x, y - 1);
        bridge.typ = DRAWBRIDGE_UP;
        bridge.flags = DB_SOUTH;
        if (blind) {
            game.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
        }
        answer(LOCK_PICK_SLOT, 'k');
        await doapply(game);
        assert.equal(
            pendingTopLine(),
            `You ${blind ? 'feel' : 'see'} no lock on the drawbridge.`,
        );
    }
});

test('a monster on the chosen square stops before the door is read',
    async () => {
    // lock.c:559-576. C separates a seen monster from a door mimic and falls
    // through for anything else; this port stops for any monster, so the test
    // uses one whose square would otherwise answer the live arm.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    const x = game.u.ux;
    const y = game.u.uy - 1;
    game.level.monsters[x] ??= [];
    game.level.monsters[x][y] = newMonster({
        mx: x, my: y, mhp: 3,
        data: {
            pmnames: ['newt', 'newt', 'newt'],
            mlet: S_FELINE,
            mflags1: 0,
            mflags2: 0,
            mflags3: 0,
        },
    });
    answer(LOCK_PICK_SLOT, 'k');
    await assert.rejects(
        () => doapply(game),
        (error) => error instanceof UnsupportedLockError
            && error.branch === 'a monster on the chosen square',
    );
});

test('pick_lock stops on every entry doapply() does not use', async () => {
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    const pick = lockPick();

    // lock.c:370. Either half of `rx != 0 || container != NULL` makes the
    // call an autounlock, which needs flags.autounlock and ynq().
    for (const [rx, ry, container] of [
        [game.u.ux, game.u.uy - 1, null],
        [0, 0, { otyp: LOCK_PICK }],
    ]) {
        await assert.rejects(
            () => pick_lock(pick, rx, ry, container, game),
            (error) => error instanceof UnsupportedLockError
                && error.branch === 'an autounlock attempt',
            `rx ${rx} container ${container ? 'set' : 'null'}`,
        );
    }

    // lock.c:373-376, do_loot_cont()'s Null pick.
    await assert.rejects(
        () => pick_lock(null, 0, 0, null, game),
        (error) => error instanceof UnsupportedLockError
            && error.branch === "do_loot_cont()'s Null pick",
    );

    // lock.c:380. Both halves of the resume test have to hold: reset_pick()
    // leaves usedtime 0, and a different tool starts a fresh attempt. It is
    // also what builds gx.xlock in the first place, because nothing on a
    // freshly made level has touched the occupation context yet.
    reset_pick(game);
    game.xlock.usedtime = 1;
    game.xlock.picktyp = LOCK_PICK;
    await assert.rejects(
        () => pick_lock(pick, 0, 0, null, game),
        (error) => error instanceof UnsupportedLockError
            && error.branch === 'resuming an interrupted attempt',
    );
    // Each half on its own lets the attempt through to the door. A fresh
    // replay in between keeps the pending open-door message from turning the
    // next prompt into a --More--.
    for (const [usedtime, picktyp] of [[1, SKELETON_KEY], [0, LOCK_PICK]]) {
        await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
        reset_pick(game);
        game.xlock.usedtime = usedtime;
        game.xlock.picktyp = picktyp;
        answer('k');
        assert.equal(
            await pick_lock(lockPick(), 0, 0, null, game),
            PICKLOCK_LEARNED_SOMETHING,
            `usedtime ${usedtime} picktyp ${picktyp}`,
        );
    }

    // lock.c:405-412. doapply() answers nohands() first, so only a direct
    // call reaches this pair.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    game.youmonst.data = { ...game.youmonst.data, mflags1: M1_NOHANDS };
    await assert.rejects(
        () => pick_lock(lockPick(), 0, 0, null, game),
        (error) => error instanceof UnsupportedLockError
            && error.branch === "pick_lock()'s no-hands message",
    );
    game.youmonst.data = { ...game.youmonst.data, mflags1: 0 };
    game.u.uswallow = 1;
    await assert.rejects(
        () => pick_lock(lockPick(), 0, 0, null, game),
        (error) => error instanceof UnsupportedLockError
            && error.branch === "pick_lock()'s engulfed message",
    );
});

test('get_adjacent_loc turns a direction into the square it names',
    async () => {
    // cmd.c:3940-3948. Each key adds its own <dx,dy> to the origin the caller
    // passes, which for pick_lock() is the hero's own square.
    for (const [key, dx, dy] of [
        ['k', 0, -1], ['j', 0, 1], ['h', -1, 0], ['l', 1, 0],
        ['y', -1, -1], ['u', 1, -1], ['b', -1, 1], ['n', 1, 1],
    ]) {
        await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
        const cc = { x: 0, y: 0 };
        answer(key);
        assert.equal(
            await get_adjacent_loc(null, 'Invalid location!',
                game.u.ux, game.u.uy, cc, game),
            1, `key ${key}`,
        );
        assert.deepEqual(cc, { x: game.u.ux + dx, y: game.u.uy + dy });
    }

    // The self key answers the origin itself, which is how pick_lock() reaches
    // its container branch.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    const cc = { x: 0, y: 0 };
    answer('.');
    assert.equal(
        await get_adjacent_loc(null, 'Invalid location!',
            game.u.ux, game.u.uy, cc, game),
        1,
    );
    assert.ok(u_at(cc.x, cc.y, game));
});

test('get_adjacent_loc refuses a square off the edge of the map', async () => {
    // cmd.c:3946 tests isok(), whose bounds are x 1..COLNO-1 and y 0..ROWNO-1.
    // No hero this port places stands on either edge, so the origin is passed
    // in directly rather than by moving her there.
    for (const [x, y, key] of [
        // x = 1 is the lowest column isok() admits, so one step west is off
        // the map; y = 0 is the lowest row, so one step north is.
        [1, 5, 'h'],
        [5, 0, 'k'],
    ]) {
        await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
        const cc = { x: -1, y: -1 };
        answer(key);
        assert.equal(
            await get_adjacent_loc(null, 'Invalid location!', x, y, cc, game),
            0, `origin <${x},${y}> key ${key}`,
        );
        assert.equal(pendingTopLine(), 'Invalid location!');
        // C writes cc only on the branch it takes.
        assert.deepEqual(cc, { x: -1, y: -1 });
    }

    // A caller that passes no cc takes the same branch however valid the
    // direction is, and a caller that passes no message prints none.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    answer('k');
    assert.equal(
        await get_adjacent_loc(null, 'Invalid location!',
            game.u.ux, game.u.uy, null, game),
        0,
    );
    assert.equal(pendingTopLine(), 'Invalid location!');

    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    answer('k');
    assert.equal(
        await get_adjacent_loc(null, null, game.u.ux, game.u.uy, null, game),
        0,
    );
    assert.equal(pendingTopLine(), '');
});

test('get_adjacent_loc says never mind when the direction prompt is cancelled',
    async () => {
    // cmd.c:3936-3939. The message belongs to this function rather than to
    // getdir(), which answers 0 silently for a quitchar.
    await standBeside(5200108, `l${APPLY_KEY}${LOCK_PICK_SLOT}k`, 'l');
    const cc = { x: -1, y: -1 };
    answer(ESCAPE_KEY);
    assert.equal(
        await get_adjacent_loc(null, 'Invalid location!',
            game.u.ux, game.u.uy, cc, game),
        0,
    );
    assert.equal(pendingTopLine(), 'Never mind.');
    assert.deepEqual(cc, { x: -1, y: -1 });
});

test('pick_lock names its three answers as lock.c does', () => {
    // lock.c:352-354. doapply() reads only whether the answer is zero, so the
    // one value that must stay distinct is PICKLOCK_DID_NOTHING.
    assert.equal(PICKLOCK_LEARNED_SOMETHING, -1);
    assert.equal(PICKLOCK_DID_NOTHING, 0);
    assert.equal(PICKLOCK_DID_SOMETHING, 1);
});

test('the matrix covers both live arms and both cancel keys', () => {
    const { segments } = loadApplyLockPickRecipe();
    // Fifteen segments over six seeds: ten for the doormask switch and five
    // for the `!IS_DOOR` arm. The count is asserted so that deleting a case
    // has to be deliberate.
    assert.equal(segments.length, 15);
    assert.equal(new Set(segments.map((s) => s.seed)).size, 6);
    // One segment starts the hero blind, which is the only way a recording
    // reaches lock.c:589-592's "feel" half.
    assert.equal(
        segments.filter((s) => /,blind\b/.test(s.nethackrc)).length, 1,
    );
    // Every segment applies the lock pick from slot `e`, and every one opens
    // and closes with a wait so a wrongly spent turn shows on the status line.
    for (const segment of segments) {
        assert.match(segment.moves, /^\..*\.$/);
        assert.ok(segment.moves.includes(`${APPLY_KEY}${LOCK_PICK_SLOT}`));
        assert.match(segment.nethackrc, /role:Rogue/);
        assert.match(segment.nethackrc, /time,showexp/);
    }
    // Both quitchars reach get_adjacent_loc()'s Never_mind.
    for (const key of [ESCAPE_KEY, ' ']) {
        assert.ok(
            segments.some((s) => s.moves.endsWith(
                `${APPLY_KEY}${LOCK_PICK_SLOT}${key}.`,
            )),
            `a segment cancels with ${JSON.stringify(key)}`,
        );
    }
});

test('the mask each matrix seed points at is the one its comment names',
    async () => {
    // The seeds were chosen by reading these masks, so a level generator
    // change that moves a door would otherwise silently retarget a case.
    const cases = [
        [5200108, 'l', 0, -1, D_ISOPEN],
        [5200164, 'll', 1, 0, D_ISOPEN],
        [5200001, 'l', 1, 0, D_NODOOR],
        [5200013, 'h', -1, 0, D_NODOOR],
        // The two walk-into-it seeds start closed and are opened by the last
        // walking key in front of the apply, so this stops one key short of it
        // and reads the mask that key is about to change.
        [5200006, 'hh', 0, 1, D_CLOSED],
        [5200022, 'jj', 0, 1, D_CLOSED],
    ];
    for (const [seed, walk, dx, dy, mask] of cases) {
        await runSegment({
            ...loadApplyLockPickRecipe().segments.find(
                (segment) => segment.seed === seed,
            ),
            moves: `.${walk}`,
        });
        const door = game.level.at(game.u.ux + dx, game.u.uy + dy);
        assert.equal(door.flags, mask, `seed ${seed}`);
    }
});
