import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_DEX,
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_FORCE,
    AUTOUNLOCK_KICK,
    AUTOUNLOCK_UNTRAP,
    BLINDED,
    CONFUSION,
    FUMBLING,
    DB_EAST,
    DB_NORTH,
    DB_SOUTH,
    DB_WEST,
    DOOR,
    DRAWBRIDGE_DOWN,
    PASSES_WALLS,
    STUNNED,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_TRAPPED,
} from '../js/const.js';
import {
    CREDIT_CARD,
    LOCK_PICK,
    PICK_AXE,
    SKELETON_KEY,
    TOOL_CLASS,
} from '../js/objects.js';
import { commandKeyCode } from '../js/command_bindings.js';
import { moveloop_core } from '../js/allmain.js';
import { newMonster } from '../js/monst.js';
import { S_FELINE } from '../js/monsters.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { effective_attribute } from '../js/attrib.js';
import {
    loadAutoopenSuppressedRecipe,
    loadClosedDoorAutoopenRecipe,
    loadLockedDoorRecipe,
} from './run-closed-door-autoopen.mjs';

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
        // Row 0 of the grid, not topMessage: topMessage is retained history, so a
        // port that printed only the first of several identical lines would
        // still satisfy it. The rendered row witnesses the line this key put
        // on screen.
        messages.push(
            game.nhDisplay.grid[0].map(cell => cell.ch).join('').trimEnd(),
        );
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

// hack.c:1097 reads svc.context.run to choose between the pull and the bump
// arm, and the two arms refuse different states, so which one the seam picks
// decides whether a walk is admitted at all. requireAutoopenClosedDoor() takes
// `run` as a parameter rather than reading state.context.run, because
// executeMovement() assigns that field only after the preflight has run, so at
// seam time it still holds the previous command's value.
//
// A trapped closed door separates the two. The pull would reach lock.c:907's
// b_trapped() tail and is refused; the bump arm never touches the door, so the
// same square is served. Reading the stale field would refuse the rush too.
test('the seam reads this command\'s run value, not the last one\'s', async () => {
    const { segments } = loadClosedDoorAutoopenRecipe();
    const base = segments.find(s => s.moves[0] === 'h');
    assert.ok(base, 'a westward walking segment supplies the door fixture');

    for (const [label, key, refused] of [
        ['walk', 'h', true],
        ['rush', 'H', false],
        ['run', '\x08', false],
    ]) {
        await runSegment({ ...base, moves: '' });
        const [dx, dy] = DIRECTIONS.h;
        const door = game.level.at(game.u.ux + dx, game.u.uy + dy);
        assert.equal(door.flags, D_CLOSED, label);
        door.flags = door.doormask = D_CLOSED | D_TRAPPED;
        // This Valkyrie's Dexterity decides which line the admitted arm
        // prints; the trap is what the assertion is about either way.
        const clumsy = effective_attribute(game, A_DEX) < 10;

        game.nhDisplay.pushKey(commandKeyCode(key));
        if (refused) {
            await assert.rejects(
                moveloop_core(),
                (error) => error.reason === 'trapped or unusual door',
                label,
            );
        } else {
            await moveloop_core();
            assert.equal(
                game.nhDisplay.topMessage,
                clumsy
                    ? 'Ouch!  You bump into a door.'
                    : 'That door is closed.',
                label,
            );
        }
        // Neither outcome disarms or fires the trap.
        assert.equal(game.level.at(game.u.ux + dx, game.u.uy + dy).flags,
            D_CLOSED | D_TRAPPED, label);
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

    // The predicate has four arms and the horizontal pair alone would leave
    // the vertical two guarded by nothing, which matters because the range
    // replaced a four-way adjacency check with this call.
    for (const [label, offset, mask, refused] of [
        // The bridge sits west of the door, so DB_EAST points back at it and
        // makes the door a portcullis; DB_WEST faces away and does not.
        ['west, facing the door', [-1, 0], DB_EAST, true],
        ['west, facing away', [-1, 0], DB_WEST, false],
        // North of the door, DB_SOUTH points back at it.
        ['north, facing the door', [0, -1], DB_SOUTH, true],
        ['north, facing away', [0, -1], DB_NORTH, false],
    ]) {
        // The mutation has to happen between reaching the prompt and the key,
        // because runSegment() regenerates the level on every call.
        await runSegment({ ...base, moves: '' });
        const door = { x: game.u.ux - 1, y: game.u.uy };
        assert.equal(game.level.at(door.x, door.y).typ, DOOR, label);
        assert.equal(game.level.at(door.x, door.y).flags, D_CLOSED, label);
        const bridge = game.level.at(door.x + offset[0], door.y + offset[1]);
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
        // Confusion and Stunned suppress autoopen like `!autoopen` does, but
        // the hero never reaches test_move(): domove_core() reroutes the step
        // through impaired_movement() first. Fumbling is read through
        // propertyPresent(), which has no blocked term, so an extrinsic source
        // is enough.
        ['confused hero', 'impaired movement',
            (st) => {
                st.u.uprops[CONFUSION] = { intrinsic: 1, extrinsic: 0 };
            }],
        ['stunned hero', 'impaired movement',
            (st) => {
                st.u.uprops[STUNNED] = { intrinsic: 1, extrinsic: 0 };
            }],
        ['fumbling hero', 'fumbling movement',
            (st) => {
                st.u.uprops[FUMBLING] = { intrinsic: 0, extrinsic: 1 };
            }],
        // hack.c:1115-1117 prints a different line for a mounted hero, inside
        // the Dexterity gate; the guard is wider than that to own the case.
        ['mounted hero', 'closed door on a steed',
            (st) => { st.u.usteed = { m_id: 1 }; }],
        ['trapped hero', 'held hero movement',
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
//
// The force-fight arm is scripts/force-fight.test.mjs's; this file keeps the
// two arms that leave the hero where he stood.
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

    // hack.c:2592-2606, the arm C prints through. It needs cmd.c
    // directionname(), which is unported, so it fails closed. The step still
    // spends no turn in C, so the refusal drops a line and nothing else.
    await runSegment({ ...base, moves: '' });
    game.u.ux = 1;
    game.context.forcefight = 0;
    game.flags.mention_walls = true;
    game.nhDisplay.pushKey(walkWest);
    await assert.rejects(
        moveloop_core(),
        (error) => error.reason === 'move out of bounds',
    );
});

// Replay each prefix of a segment and report where the hero stands, what the
// turn counter reads, and the terrain one square ahead in the walking
// direction. Every locked segment walks in one direction throughout.
async function replayEachKey(segment, [dx, dy]) {
    const states = [];
    for (let keys = 0; keys <= segment.moves.length; ++keys) {
        await runSegment({ ...segment, moves: segment.moves.slice(0, keys) });
        const ahead = game.level.at(game.u.ux + dx, game.u.uy + dy);
        states.push({
            x: game.u.ux,
            y: game.u.uy,
            turn: game.moves,
            // Rendered row 0, not the retained topMessage; see
            // doorMaskAfterEachKey() for why history is the wrong witness.
            message: game.nhDisplay.grid[0].map(cell => cell.ch).join('').trimEnd(),
            accessible: Boolean(game.a11y?.accessiblemsg),
            aheadTyp: ahead?.typ,
            aheadMask: ahead?.flags,
        });
    }
    return states;
}

test('the locked matrix contains only source-selected inputs', () => {
    const recipe = loadLockedDoorRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 9);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        // Each segment walks one direction throughout, which is what lets the
        // replay helper above read the door off the hero's facing.
        for (const key of segment.moves) {
            assert.equal(key, segment.moves[0], 'one direction per segment');
        }
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

// C ref: lock.c:855-875. A locked door takes the message switch instead of the
// rnl(20) roll, so nothing about the door changes and the hero stays put. The
// message itself is compared against fresh C by
// scripts/run-closed-door-autoopen.mjs; what this pins is that every segment
// really reaches the arm and that repeating the key repeats the refusal.
test('every locked segment stops at a door that stays locked', async () => {
    const { segments } = loadLockedDoorRecipe();
    for (const [index, segment] of segments.entries()) {
        const direction = segment.moves[0];
        const states = await replayEachKey(segment, DIRECTIONS[direction]);
        let pulls = 0;
        for (let keys = 1; keys < states.length; ++keys) {
            const before = states[keys - 1];
            const after = states[keys];
            const label = `segment ${index} key ${keys}`;
            if (before.x !== after.x || before.y !== after.y) {
                // An ordinary step across the room on the way to the door.
                assert.equal(after.turn, before.turn + 1, label);
                continue;
            }
            ++pulls;
            // js/startup_a11y.js messageAt() prefixes the line with the
            // direction set_msg_xy() named, but only with accessiblemsg on.
            assert.equal(
                after.message,
                after.accessible
                    ? `(${DIRECTION_NAMES[direction]}): This door is locked.`
                    : 'This door is locked.',
                label,
            );
            // hack.c:1111 leaves svc.context.move FALSE, so the refused pull
            // costs no game time however often it repeats.
            assert.equal(after.turn, before.turn, label);
            assert.equal(after.aheadTyp, DOOR, label);
            assert.equal(after.aheadMask, D_LOCKED, label);
        }
        assert.ok(pulls >= 1, `segment ${index} pulls at a locked door`);
    }
});

// requireAutoopenClosedDoor() gained three terms with the locked arm, and the
// recorded matrix covers none of them: a fresh case can only show the states C
// and the port agree on. Each case below installs the locked door the recipe
// already provides and adds the single state that diverges, so it fails if and
// only if its own term is removed.
test('the locked arm refuses what doopen_indir cannot answer for', async () => {
    const base = loadLockedDoorRecipe().segments[0];
    const walkNorth = commandKeyCode(base.moves[0]);
    // A tool needs only the fields inventory_weight() reads; nothing on a
    // refused path looks at the rest.
    // Appended at the TAIL, not the head: prepending leaves the seam's loop
    // unexercised, so a first-object-only implementation would pass.
    const carrying = (otyp) => (state) => {
        const tool = {
            otyp, oclass: TOOL_CLASS, owt: 4, quan: 1, nobj: null,
        };
        if (!state.invent) {
            state.invent = tool;
            return;
        }
        let last = state.invent;
        while (last.nobj) last = last.nobj;
        last.nobj = tool;
    };

    const refusals = [
        // lock.c:907's D_TRAPPED half fires b_trapped() and bills a shop, but
        // only from the "known to be CLOSED" arm, so D_CLOSED is what makes it
        // reachable. D_LOCKED | D_TRAPPED returns at lock.c:895 instead and is
        // served, which the sibling test below pins.
        ['trapped closed door', 'trapped or unusual door',
            (state, door) => { door.flags = D_CLOSED | D_TRAPPED; }],
        // lock.c:884-893 needs AUTOUNLOCK_KICK and a live ynq() prompt.
        ['autounlock kick', 'autounlock kick prompt',
            (state) => { state.flags.autounlock = AUTOUNLOCK_KICK; }],
    ];

    for (const [label, reason, apply] of refusals) {
        await runSegment({ ...base, moves: '' });
        const door = game.level.at(game.u.ux, game.u.uy - 1);
        assert.equal(door.flags, D_LOCKED, label);
        apply(game, door);

        game.nhDisplay.pushKey(walkNorth);
        await assert.rejects(
            moveloop_core(),
            (error) => error.reason === reason,
            label,
        );
    }
});

test('combined autounlock bits keep apply-key before kick', async () => {
    const base = loadLockedDoorRecipe().segments[0];
    const walkNorth = commandKeyCode(base.moves[0]);
    const combined = AUTOUNLOCK_APPLY_KEY | AUTOUNLOCK_KICK
        | AUTOUNLOCK_FORCE;

    // With a recognized tool, apply-key runs first and prompts "Unlock it
    // with your skeleton key?"; answering 'q' cancels without reaching the
    // kick arm. Key order: walk-direction, space to dismiss the "This door
    // is locked." --More-- line, then 'q' to cancel the ynq prompt.
    await runSegment({ ...base, moves: '' });
    game.flags.autounlock = combined;
    game.invent = {
        otyp: SKELETON_KEY, oclass: TOOL_CLASS, owt: 3, quan: 1,
        nobj: game.invent,
    };
    game.nhDisplay.pushKey(walkNorth);
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    game.nhDisplay.pushKey('q'.charCodeAt(0));
    await moveloop_core(); // completes without throwing

    // Without a recognized tool, apply-key finds nothing and the kick arm
    // fires, which is still refused.
    await runSegment({ ...base, moves: '' });
    game.flags.autounlock = combined;
    game.nhDisplay.pushKey(walkNorth);
    await assert.rejects(
        moveloop_core(),
        (error) => error.reason === 'autounlock kick prompt',
        'no recognized tool',
    );
});

// The counterpart to the refusals above. Each term has to be narrow enough to
// leave the ported case running, or the arm the fresh recordings cover would
// disappear behind a guard the suite still reports as green.
test('the locked arm still runs for the states it owns', async () => {
    const locked = loadLockedDoorRecipe().segments[0];
    const closed = loadClosedDoorAutoopenRecipe()
        .segments.find((segment) => segment.moves[0] === 'h');

    const admitted = [
        // A tool outside autokey()'s three object types leaves the locked
        // door on the ported path.
        ['pick-axe at a locked door', locked, 'k', (state) => {
            state.invent = {
                otyp: PICK_AXE, oclass: TOOL_CLASS, owt: 100, quan: 1,
                nobj: state.invent,
            };
        }],
        // lock.c:876 gates the tail on any nonzero mask, but UNTRAP and FORCE
        // have no door arm. A carried key still does nothing when APPLY_KEY is
        // absent, which keeps the inventory refusal scoped to the active bit.
        ['no autounlock with a skeleton key', locked, 'k', (state) => {
            state.flags.autounlock = 0;
            state.invent = {
                otyp: SKELETON_KEY, oclass: TOOL_CLASS, owt: 3, quan: 1,
                nobj: state.invent,
            };
        }],
        ['door-inert untrap', locked, 'k', (state) => {
            state.flags.autounlock = AUTOUNLOCK_UNTRAP;
        }],
        ['door-inert force', locked, 'k', (state) => {
            state.flags.autounlock = AUTOUNLOCK_FORCE;
        }],
        // lock.c reaches the autounlock tail only from the message switch, so
        // a key changes nothing at a door that is merely closed.
        ['skeleton key at a closed door', closed, 'h', (state) => {
            state.invent = {
                otyp: SKELETON_KEY, oclass: TOOL_CLASS, owt: 3, quan: 1,
                nobj: state.invent,
            };
        }],
    ];

    for (const [label, segment, direction, apply] of admitted) {
        await runSegment({ ...segment, moves: '' });
        const [dx, dy] = DIRECTIONS[direction];
        const door = game.level.at(game.u.ux + dx, game.u.uy + dy);
        const mask = door.flags;
        assert.ok([D_CLOSED, D_LOCKED].includes(mask), label);
        apply(game);

        game.nhDisplay.pushKey(commandKeyCode(direction));
        await moveloop_core();
        // topMessage rather than the rendered row here: these cases drive
        // moveloop_core() directly and the frame has advanced past the line
        // by the time control returns, so row 0 is blank. The replay path in
        // doorMaskAfterEachKey() is where the history-versus-render
        // distinction bites, and that one reads the grid.
        assert.equal(
            game.nhDisplay.topMessage,
            mask === D_LOCKED ? 'This door is locked.' : 'The door opens.',
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

// lock.c:855 tests only D_CLOSED, so D_LOCKED | D_TRAPPED enters the same
// message switch as a plain locked door, prints the same line and returns at
// :895. The b_trapped() and add_damage() tail at :907-911 sits inside the
// "known to be CLOSED" arm below that return. The seam refused this mask until
// the pass over 5879bed..cdb83a4, on the premise that any D_TRAPPED bit
// reached the trap.
test('a trapped locked door is named, not refused', async () => {
    const base = loadLockedDoorRecipe().segments[0];
    const walkNorth = commandKeyCode(base.moves[0]);

    const replay = await runSegment({ ...base, moves: '' });
    const door = game.level.at(game.u.ux, game.u.uy - 1);
    assert.equal(door.flags, D_LOCKED);
    door.flags = door.doormask = D_LOCKED | D_TRAPPED;
    // replay.getRngLog(), not game.rng: nothing assigns game.rng, so a
    // comparison against it is a constant 0 on both sides.
    const drawsBefore = replay.getRngLog().length;

    game.nhDisplay.pushKey(walkNorth);
    await moveloop_core();

    // topMessage: see the sibling test above for why the rendered row is
    // blank after a direct moveloop_core() drive.
    assert.equal(game.nhDisplay.topMessage, 'This door is locked.');
    // The trap did not fire: C only reaches b_trapped() through the roll, and
    // this mask never gets there, so the mask is untouched and nothing drew.
    assert.equal(door.flags, D_LOCKED | D_TRAPPED);
    assert.equal(replay.getRngLog().length, drawsBefore);
});

// The keys the suppressed matrix walks with. cmd.c gives each of them a
// svc.context.run value: 0 for a lowercase step, 1 for an uppercase rush
// (do_rush_<dir>), and 3 for the ctrl byte of the same letter (do_run_<dir>).
// hack.c:1097 reads only whether that value is nonzero.
const SUPPRESSED_KEYS = {
    h: [-1, 0], j: [0, 1], l: [1, 0], u: [1, -1], n: [1, 1],
    H: [-1, 0], L: [1, 0],
    '\x08': [-1, 0], '\x0c': [1, 0],
};

test('the suppressed matrix contains only source-selected inputs', () => {
    const recipe = loadAutoopenSuppressedRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 18);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        for (const key of segment.moves) {
            assert.ok(SUPPRESSED_KEYS[key], 'every key is a walking key');
            assert.equal(key, segment.moves[0], 'one direction per segment');
        }
    }
    // hack.c:1097's two ported suppression terms. A segment that does not set
    // `!autoopen` reaches the arm through svc.context.run instead, and there
    // are four of those: the uppercase rush and the ctrl run, once for each
    // side of the Dexterity gate.
    assert.equal(
        recipe.segments.filter(
            ({ nethackrc }) => !nethackrc.includes('!autoopen'),
        ).length,
        4,
    );
    // The three options that make otherwise invisible parts of the arm
    // observable. Each gets one segment per outcome, because the bump and
    // "That door is closed." differ in exactly what these show: the turn
    // counter, whether the pet gets a move, and which line is printed.
    for (const option of ['time', 'pettype:dog', 'accessiblemsg']) {
        assert.equal(
            recipe.segments.filter(
                ({ nethackrc }) => nethackrc.includes(option),
            ).length,
            2,
            `two segments set ${option}`,
        );
    }
});

// C ref: hack.c:1099-1128. With autoopen suppressed the door is never touched,
// so every key in a segment repeats one of three results, chosen by whether
// the step is orthogonal and by ACURR(A_DEX) < 10. The complete screens and
// cursors are compared against fresh C by
// scripts/run-closed-door-autoopen.mjs; what this pins is the line, the turn
// cost, and that the door and the hero both stay put.
test('a suppressed pull repeats one of three results and moves nothing', async () => {
    const { segments } = loadAutoopenSuppressedRecipe();
    let bumped = 0;
    let told = 0;
    let silent = 0;
    let exercised = 0;

    for (const [index, segment] of segments.entries()) {
        const [dx, dy] = SUPPRESSED_KEYS[segment.moves[0]];
        const diagonal = dx !== 0 && dy !== 0;
        let door = null;
        let start = null;
        let previousTurn = 0;
        let previousExercise = 0;

        for (let keys = 0; keys <= segment.moves.length; ++keys) {
            const replay = await runSegment({
                ...segment, moves: segment.moves.slice(0, keys),
            });
            const label = `segment ${index} key ${keys}`;
            // A positive witness that the arm ran, which "nothing observable
            // happened" is not: a boundary refusal produces the same blank
            // line and the same unchanged door, but stops the segment short.
            // The diagonal arm has no other oracle, since hack.c:1112 gates
            // both messages on `x == ux || y == uy` and it prints neither.
            assert.equal(replay.getScreens().length, keys + 1, label);
            if (keys === 0) {
                door = { x: game.u.ux + dx, y: game.u.uy + dy };
                start = {
                    x: game.u.ux,
                    y: game.u.uy,
                    mask: game.level.at(door.x, door.y).flags,
                    // acurr(A_DEX) is fixed for the segment: the bump exercises
                    // Dexterity, and AEXE is a separate counter from ACURR.
                    dex: effective_attribute(game, A_DEX),
                };
                assert.equal(game.level.at(door.x, door.y).typ, DOOR, label);
                assert.ok(
                    [D_CLOSED, D_LOCKED].includes(start.mask),
                    `${label} starts at a closed or locked door`,
                );
                previousTurn = game.moves;
                previousExercise = game.u.aexe[A_DEX];
                continue;
            }
            // Row 0, not topMessage: topMessage is retained history, so the
            // silent diagonal case would pass against the previous key's line.
            const message = game.nhDisplay.grid[0]
                .map(cell => cell.ch).join('').trimEnd();
            const bumps = !diagonal && start.dex < 10;
            if (diagonal) ++silent;
            else if (bumps) ++bumped;
            else ++told;
            assert.equal(
                message,
                diagonal
                    ? ''
                    : bumps
                        ? 'Ouch!  You bump into a door.'
                        : 'That door is closed.',
                label,
            );
            // hack.c:1122 sets svc.context.move alongside door_opened, which
            // is the only closed-door outcome that spends the hero's turn.
            assert.equal(Boolean(game.context.door_opened), bumps, label);
            assert.equal(game.moves - previousTurn, bumps ? 1 : 0, label);
            previousTurn = game.moves;
            // attrib.c exercise(A_DEX, FALSE) adds -rn2(2) to AEXE(A_DEX), so
            // a bump either leaves it alone or lowers it by one and no other
            // outcome may touch it. exerper()'s satiated arm is the only other
            // caller and this hero is merely not hungry.
            const exercise = game.u.aexe[A_DEX] - previousExercise;
            assert.ok(bumps ? exercise === 0 || exercise === -1
                : exercise === 0, label);
            if (exercise < 0) ++exercised;
            previousExercise = game.u.aexe[A_DEX];
            // Nothing on this arm calls doopen_indir(), so the mask survives
            // however often the key repeats, and the hero never advances.
            assert.equal(game.level.at(door.x, door.y).flags, start.mask,
                label);
            assert.equal(game.u.ux, start.x, label);
            assert.equal(game.u.uy, start.y, label);
        }
    }
    // 14 bumps, 14 refusals and 4 silent diagonal steps across the matrix,
    // counted so a segment that stopped reaching its arm shows up here rather
    // than passing vacuously. The two orthogonal totals match because the
    // matrix pairs each Valkyrie segment with a Healer one.
    assert.equal(bumped, 14);
    assert.equal(told, 14);
    assert.equal(silent, 4);
    // Three of those 14 bumps drew a 1 from rn2(2) and lowered
    // AEXE(A_DEX). Deleting the exercise() call leaves this at zero.
    assert.equal(exercised, 3);
});

// The early return at hack.c:1097 is what stops doopen_indir()'s refusals from
// applying: with the pull suppressed C never calls that function, so a state
// only it diverges on must leave the walk admitted. Placing the return below
// those checks instead would refuse cases C answers.
test('a suppressed pull drops the refusals doopen_indir owns', async () => {
    const base = loadAutoopenSuppressedRecipe().segments[0];
    const walkWest = commandKeyCode(base.moves[0]);

    const admitted = [
        // lock.c:907's b_trapped() tail sits inside the roll, and the roll
        // never happens here, so the trap bit cannot fire.
        ['trapped closed door', (state, door) => {
            door.flags = door.doormask = D_CLOSED | D_TRAPPED;
        }],
        // lock.c:876-893's autounlock tail hangs off the message switch,
        // which only the pull reaches. These two set D_LOCKED as well: the
        // seam runs its unlocking-tool and autounlock refusals only for a mask
        // that is not plain D_CLOSED, so against the recipe's own door they
        // would be admitted whether or not the early return existed, and could
        // not fail. With D_LOCKED the refusals genuinely apply and the return
        // is what drops them.
        ['skeleton key', (state, door) => {
            door.flags = door.doormask = D_LOCKED;
            state.invent = {
                otyp: SKELETON_KEY, oclass: TOOL_CLASS, owt: 3, quan: 1,
                nobj: state.invent,
            };
        }],
        ['autounlock setting', (state, door) => {
            door.flags = door.doormask = D_LOCKED;
            state.flags.autounlock = AUTOUNLOCK_KICK;
        }],
    ];

    for (const [label, apply] of admitted) {
        const replay = await runSegment({ ...base, moves: '' });
        const door = game.level.at(game.u.ux - 1, game.u.uy);
        assert.equal(door.flags, D_CLOSED, label);
        const drawsBefore = replay.getRngLog().length;
        apply(game, door);

        game.nhDisplay.pushKey(walkWest);
        await moveloop_core();
        // topMessage rather than the rendered row: this case drives
        // moveloop_core() directly and the frame has advanced past the line by
        // the time control returns, as the locked siblings above explain.
        assert.equal(game.nhDisplay.topMessage, 'That door is closed.', label);
        // This hero has Dexterity 10, so the arm prints and stops: no draw and
        // no change to the door.
        assert.equal(replay.getRngLog().length, drawsBefore, label);
    }
});

// The mirror of `a suppressed pull drops the refusals doopen_indir owns`, and
// the pin for this slice's central placement decision. u.usteed, m_at() and
// u.utrap sit ABOVE `if (autoopenSuppressed(state, run)) return;` because
// domove_core() would have routed the step elsewhere before test_move() ran:
// a mounted hero diverges whichever arm the autoopen test picks, a monster on
// the destination is attacked at 2786-2796, and a held hero goes to
// trapmove() at 2830. Move any of them below the return and the suppressed arm
// walks into the bump instead of refusing, which is what these cases catch.
test('a suppressed pull keeps the refusals that precede doopen_indir', async () => {
    const base = loadAutoopenSuppressedRecipe().segments[0];
    const walkWest = commandKeyCode(base.moves[0]);

    const refusals = [
        ['steed', 'closed door on a steed',
            (state) => { state.u.usteed = { mx: 1, my: 1 }; }],
        ['held hero', 'held hero movement',
            (state) => { state.u.utrap = 3; }],
        // Not 'monster on a closed door': preflightDomoveDestination()'s
        // `if (destinationMonster)` arm precedes its closed_door() arm, so the
        // seam claims a monster-occupied door for the combat path and the
        // m_at() guard inside requireAutoopenClosedDoor() is shadowed end to
        // end. The guard is defensive for the test_move() call inside
        // domove(). This case pins the shadowing, so removing the seam's
        // monster arm shows up here rather than silently changing which
        // refusal a player sees.
        //
        // The target is undetected, which is the one destination monster the
        // seam still refuses outright: C decides it at
        // domove_attackmon_at():1968 and never calls do_attack(). A spotted
        // hostile would be attacked instead, and the attack draws, which is
        // what the zero-draw assertion below would then catch.
        ['monster on the door', 'attacking a hidden monster',
            (state, door) => {
                const monster = newMonster({
                    mx: door.x, my: door.y, mhp: 3,
                    data: { pmnames: ['newt', 'newt', 'newt'], mlet: S_FELINE,
                        mflags1: 0, mflags2: 0, mflags3: 0 },
                });
                monster.mundetected = 1;
                state.level.monsters[door.x] ??= [];
                state.level.monsters[door.x][door.y] = monster;
            }],
    ];

    for (const [label, reason, apply] of refusals) {
        const replay = await runSegment({ ...base, moves: '' });
        const door = { x: game.u.ux - 1, y: game.u.uy };
        const cell = game.level.at(door.x, door.y);
        assert.equal(cell.flags, D_CLOSED, label);
        const drawsBefore = replay.getRngLog().length;
        apply(game, door);

        game.nhDisplay.pushKey(walkWest);
        await assert.rejects(
            moveloop_core(),
            (error) => error.reason === reason,
            label,
        );
        // Refused before the arm ran: no draw, no message, door untouched.
        assert.equal(replay.getRngLog().length, drawsBefore, label);
        assert.equal(cell.flags, D_CLOSED, label);
    }
});
