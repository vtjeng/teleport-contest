import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    CONFUSION,
    DB_EAST,
    DB_WEST,
    DOOR,
    DRAWBRIDGE_DOWN,
    PASSES_WALLS,
    D_CLOSED,
    D_ISOPEN,
} from '../js/const.js';
import { commandKeyCode } from '../js/command_bindings.js';
import { moveloop_core } from '../js/allmain.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { loadClosedDoorAutoopenRecipe } from './run-closed-door-autoopen.mjs';

// cmd.c cmdlist[] binds these keys to the eight walking directions.
const DIRECTIONS = {
    h: [-1, 0], j: [0, 1], k: [0, -1], l: [1, 0],
    y: [-1, -1], u: [1, -1], b: [-1, 1], n: [1, 1],
};

// The direction word set_msg_xy() puts in front of a message naming a square
// adjacent to the hero.
const DIRECTION_NAMES = {
    h: 'west', j: 'south', k: 'north', l: 'east',
    y: 'northwest', u: 'northeast', b: 'southwest', n: 'southeast',
};

// Replay each prefix of a segment's keys and report the door's mask after
// each one, together with the turn counter. Every segment walks in one
// direction throughout, so the door stays at the square the first key
// targeted.
async function doorMaskAfterEachKey(segment) {
    const [dx, dy] = DIRECTIONS[segment.moves[0]];
    const masks = [];
    const turns = [];
    const doorOpened = [];
    const messages = [];
    const accessible = [];
    let door = null;
    for (let keys = 0; keys <= segment.moves.length; ++keys) {
        await runSegment({ ...segment, moves: segment.moves.slice(0, keys) });
        if (keys === 0) {
            door = { x: game.u.ux + dx, y: game.u.uy + dy };
        }
        masks.push(game.level.at(door.x, door.y).flags);
        turns.push(game.moves);
        doorOpened.push(game.context.door_opened);
        messages.push(game.nhDisplay?.topMessage);
        accessible.push(Boolean(game.a11y?.accessiblemsg));
    }
    return { door, masks, turns, doorOpened, messages, accessible };
}

test('the autoopen matrix contains only source-selected inputs', () => {
    const recipe = loadClosedDoorAutoopenRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 10);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.ok(
            DIRECTIONS[segment.moves[0]],
            'every segment opens with a walking key',
        );
    }
    // The three options that make otherwise invisible parts of the arm
    // observable, one segment each: the turn counter, a pet that must not
    // move, and set_msg_xy()'s coordinate prefix.
    for (const option of ['time', 'pettype:dog', 'accessiblemsg']) {
        assert.equal(
            recipe.segments.filter(
                ({ nethackrc }) => nethackrc.includes(option),
            ).length,
            1,
            `one segment sets ${option}`,
        );
    }
});

test('every matrix segment starts beside a plain closed door', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    for (const [index, segment] of segments.entries()) {
        const [dx, dy] = DIRECTIONS[segment.moves[0]];
        await runSegment({ ...segment, moves: '' });
        const door = game.level.at(game.u.ux + dx, game.u.uy + dy);
        assert.equal(door.typ, DOOR, `segment ${index} terrain`);
        // Exactly D_CLOSED: a locked, trapped or broken door belongs to a
        // different arm of doopen_indir() and is refused before the walk.
        assert.equal(door.flags, D_CLOSED, `segment ${index} mask`);
    }
});

test('every matrix segment runs to its last keystroke', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    for (const [index, segment] of segments.entries()) {
        const replay = await runSegment(segment);
        assert.equal(
            replay.getScreens().length,
            segment.moves.length + 1,
            `segment ${index} emits one screen per key plus the first prompt`,
        );
    }
});

test('the matrix covers both outcomes of the rnl(20) roll', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    let resisted = 0;
    let opened = 0;
    let walkedThrough = 0;
    for (const segment of segments) {
        const { door, masks } = await doorMaskAfterEachKey(segment);
        // masks[0] is the state before any key.
        if (masks[1] === D_CLOSED) ++resisted;
        if (masks.at(-1) === D_ISOPEN) ++opened;
        if (game.u.ux === door.x && game.u.uy === door.y) ++walkedThrough;
    }
    // Three segments miss on their first pull, seven open it straight away,
    // and every one of the ten ends with the door open.
    assert.equal(resisted, 3);
    assert.equal(opened, 10);
    // The doorway an opened door leaves behind has to be walkable, which is
    // the observable result the slice ends on. The two diagonal segments
    // cannot demonstrate it: test_move() refuses a diagonal doorway entry.
    assert.equal(walkedThrough, 7);
});

test('pulling at the door spends no game time', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    for (const [index, segment] of segments.entries()) {
        const { masks, turns } = await doorMaskAfterEachKey(segment);
        for (let keys = 1; keys < turns.length; ++keys) {
            // hack.c:1111 leaves svc.context.move FALSE for every pull, so
            // the turn counter may only advance on a key that moved the hero.
            const pulled = masks[keys - 1] !== D_ISOPEN;
            assert.equal(
                turns[keys] - turns[keys - 1],
                pulled ? 0 : 1,
                `segment ${index} key ${keys}`,
            );
        }
    }
});

// hack.c:1097 requires !svc.context.run, so a run or rush into a closed door
// takes the unported "That door is closed."/bump arm instead of autoopening.
// The refusal has to be raised at the admission seam, before cmd.js commits
// the movement intent: requireAutoopenClosedDoor() reads a `run` parameter
// rather than state.context.run, because executeMovement() assigns that field
// only after the preflight has run, so at seam time it still holds the
// previous command's value.
test('a run into a closed door is refused before the intent commits', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    const base = segments.find(s => s.moves[0] === 'h');
    assert.ok(base, 'a westward walking segment supplies the door fixture');

    for (const [label, key] of [['rush', 'H'], ['run', '\x08']]) {
        await runSegment({ ...base, moves: '' });
        const [dx, dy] = DIRECTIONS.h;
        const door = { x: game.u.ux + dx, y: game.u.uy + dy };
        assert.equal(game.level.at(door.x, door.y).flags, D_CLOSED, label);

        await runSegment({ ...base, moves: key });
        // Refused at the seam, so resetCommandVars() left every field the
        // committed intent would have set at 0. Reading the stale
        // state.context.run instead admitted the command here and refused it
        // later inside domove(), with run, move, mv and multi all set.
        assert.equal(game.context.run, 0, `${label} run`);
        assert.equal(game.context.move, 0, `${label} move`);
        assert.equal(game.context.mv, 0, `${label} mv`);
        assert.equal(game.multi, 0, `${label} multi`);
        // The pull never happened, so the door is untouched.
        assert.equal(game.level.at(door.x, door.y).flags, D_CLOSED, label);
    }
});

// lock.c:826 diverts a door into the drawbridge messages only when
// dbridge.c is_drawbridge_wall() answers >= 0, and that predicate (148-159)
// needs the neighbouring bridge's DB_DIR to point back at the door. A bare
// adjacency test refuses a superset: it would also refuse a door whose
// neighbouring bridge faces away, which C opens normally.
test('a drawbridge facing away from the door is not a portcullis', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    const base = segments.find(seg => seg.moves[0] === 'h');
    const walkWest = commandKeyCode('h');

    for (const [label, mask, refused] of [
        // The bridge sits west of the door, so DB_EAST points back at it and
        // makes the door a portcullis; DB_WEST faces away and does not.
        ['facing the door', DB_EAST, true],
        ['facing away', DB_WEST, false],
    ]) {
        // The mutation has to happen between reaching the prompt and the key,
        // because runSegment() regenerates the level on every call.
        await runSegment({ ...base, moves: '' });
        const door = { x: game.u.ux - 1, y: game.u.uy };
        assert.equal(game.level.at(door.x, door.y).typ, DOOR, label);
        assert.equal(game.level.at(door.x, door.y).flags, D_CLOSED, label);
        const bridge = game.level.at(door.x - 1, door.y);
        bridge.typ = DRAWBRIDGE_DOWN;
        bridge.flags = mask;

        game.nhDisplay.pushKey(walkWest);
        if (refused) {
            await assert.rejects(
                moveloop_core(),
                (error) => /portcullis/.test(error.message),
                label,
            );
            assert.equal(game.level.at(door.x, door.y).flags, D_CLOSED, label);
        } else {
            await moveloop_core();
            // The pull ran: the door either opened or resisted, but no
            // portcullis refusal intervened.
            assert.ok(
                [D_CLOSED, D_ISOPEN].includes(
                    game.level.at(door.x, door.y).flags,
                ),
                label,
            );
        }
    }
});

// svc.context.door_opened is the field that suppresses domove_core()'s
// `move = 0; nomul(0)` at hack.c:2844-2847, and adding it rewrote all 17
// second-complete-turn digests. `pulling at the door spends no game time`
// cannot stand in for it: context.move is 0 on both arms of the branch it
// feeds, so that test passes whether or not the field is ever written.
test('door_opened tracks whether the pull succeeded', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    for (const [index, segment] of segments.entries()) {
        const { masks, doorOpened } = await doorMaskAfterEachKey(segment);
        for (let keys = 1; keys < doorOpened.length; ++keys) {
            const wasClosed = masks[keys - 1] === D_CLOSED;
            const isOpen = masks[keys] === D_ISOPEN;
            // hack.c:1110 sets door_opened = !closed_door(x, y) after the
            // pull, so it is true exactly when this key left the door open
            // having found it closed. A key that steps onto an already-open
            // doorway never reaches the arm and leaves it false.
            assert.equal(
                Boolean(doorOpened[keys]),
                wasClosed && isOpen,
                `segment ${index} key ${keys}`,
            );
        }
    }
});

// requireAutoopenClosedDoor() has six refusal terms and the committed matrix
// covered one, so each of the others was individually deletable with the whole
// suite green. Each case below installs the plain D_CLOSED door the recipe
// already provides and adds the single state that diverges, so it fails if and
// only if its own term is removed. These do not join the refusal matrix in
// scripts/cmd.test.mjs, whose contract is that a refusal changes no state:
// blinding or confusing the hero legitimately repaints the status line.
test('every autoopen refusal term is reachable and individually pinned', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    const base = segments.find(seg => seg.moves[0] === 'h');
    const walkWest = commandKeyCode('h');

    const cases = [
        ['blind hero', 'blind door opening',
            (st) => { st.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0 }; }],
        ['walls-passing hero', 'door bypassed rather than opened',
            (st) => {
                st.u.uprops[PASSES_WALLS] = { intrinsic: 1, extrinsic: 0 };
            }],
        ['confused hero', 'autoopen suppressed',
            (st) => {
                st.u.uprops[CONFUSION] = { intrinsic: 1, extrinsic: 0 };
            }],
        ['autoopen off', 'autoopen suppressed',
            (st) => { st.flags.autoopen = false; }],
        ['trapped hero', 'door opening interrupted',
            (st) => { st.u.utrap = 3; }],
    ];

    for (const [label, reason, apply] of cases) {
        await runSegment({ ...base, moves: '' });
        const door = { x: game.u.ux - 1, y: game.u.uy };
        assert.equal(game.level.at(door.x, door.y).flags, D_CLOSED, label);
        apply(game);

        game.nhDisplay.pushKey(walkWest);
        await assert.rejects(
            moveloop_core(),
            (error) => error.reason === reason,
            label,
        );
        // Refused before the pull, so no draw and no mask change.
        assert.equal(game.level.at(door.x, door.y).flags, D_CLOSED, label);
    }
});

// hack.c move_out_of_bounds() took over the off-map refusal from an accident:
// blocksMove() used to answer "blocked" for a square with no location, and
// deleting its door term exposed that. The committed rush case reaches the
// silent arm only, with mention_walls off, so the fail-closed guard and the
// context.move = 0 beside it were both deletable with the suite green.
test('an off-map step refuses silently, or fails closed when it would speak', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    const base = segments.find(seg => seg.moves[0] === 'h');

    // Walk the hero onto column 1; one more step west leaves the map.
    await runSegment({ ...base, moves: '' });
    const walkWest = commandKeyCode('h');
    game.u.ux = 1;
    game.context.forcefight = 0;
    game.flags.mention_walls = false;
    const movesBefore = game.moves;

    game.nhDisplay.pushKey(walkWest);
    await moveloop_core();
    // The silent arm: nomul(0) and context.move = 0, no boundary raised.
    assert.equal(game.u.ux, 1);
    assert.equal(game.context.move, 0);
    assert.equal(game.multi, 0);
    assert.equal(game.moves, movesBefore);

    // Both arms C would print through instead fail closed, because neither
    // message is ported.
    for (const [label, apply] of [
        ['mention_walls', (st) => { st.flags.mention_walls = true; }],
        ['forcefight', (st) => { st.context.forcefight = 1; }],
    ]) {
        await runSegment({ ...base, moves: '' });
        game.u.ux = 1;
        game.flags.mention_walls = false;
        game.context.forcefight = 0;
        apply(game);
        game.nhDisplay.pushKey(walkWest);
        await assert.rejects(
            moveloop_core(),
            (error) => error.reason === 'move out of bounds',
            label,
        );
    }
});

// The replay test above asserts a screen count, which no message or glyph
// change can fail. The complete 24x80 screens and cursors are compared against
// fresh C by scripts/run-closed-door-autoopen.mjs, which is the stronger
// oracle; what was missing here is the message each pull prints, so a silent
// pull or a swapped pair of outcomes passed unnoticed.
test('each pull prints the message its outcome calls for', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    for (const [index, segment] of segments.entries()) {
        const { masks, messages, accessible }
            = await doorMaskAfterEachKey(segment);
        for (let keys = 1; keys < messages.length; ++keys) {
            if (masks[keys - 1] === D_ISOPEN) continue; // an ordinary step
            // lock.c:904-919. The roll decides which line prints, and the two
            // must not be interchangeable.
            const line = masks[keys] === D_ISOPEN
                ? 'The door opens.'
                : 'The door resists!';
            // js/startup_a11y.js messageAt() prefixes the line with the
            // direction of the square set_msg_xy() named, but only when
            // accessiblemsg is on, so the expected form follows the segment's
            // own option rather than a fixed string.
            const direction = DIRECTION_NAMES[segment.moves[0]];
            assert.equal(
                messages[keys],
                accessible[keys] ? `(${direction}): ${line}` : line,
                `segment ${index} key ${keys}`,
            );
        }
    }
});
