import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    DIGTYP_DOOR,
    DIGTYP_ROCK,
    DIGTYP_TREE,
    DIGTYP_UNDIGGABLE,
    DOOR,
    D_CLOSED,
    D_LOCKED,
    D_NODOOR,
    OBJ_DELETED,
    OBJ_INVENT,
    POOL,
    ROOM,
    SDOOR,
    STONE,
    TREE,
    VWALL,
} from '../js/const.js';
import { dig_typ, rot_corpse, unportedRotCorpseReason } from '../js/dig.js';
import { GameMap } from '../js/game.js';
import { newObject, place_object } from '../js/obj.js';
import {
    PM_CAVE_SPIDER,
    PM_JACKAL,
    PM_ORC,
    monst_globals_init,
} from '../js/monsters.js';
import {
    AXE,
    CORPSE,
    DWARVISH_MATTOCK,
    LONG_SWORD,
    PICK_AXE,
    ROCK,
    objects_globals_init,
} from '../js/objects.js';
import { timeout_globals_init } from '../js/timeout.js';
import { RECORDER_SEGMENT_LIMIT } from './fresh-matrix.mjs';
import { loadCorpseRotRecipe } from './run-corpse-rot.mjs';

// dig_typ() reads a level and an object catalog and nothing else, so a bare
// map plus objects[] is the whole world it needs.
function digState() {
    const state = { level: new GameMap() };
    objects_globals_init(state);
    return state;
}

// obj.h is_pick() and is_axe() read an object's oclass and the oc_skill field
// that js/objects.js stores as oc_subtyp; nothing else about the tool reaches
// dig_typ().
function tool(otyp, state) {
    return { otyp, oclass: state.objects[otyp].oc_class };
}

// An arbitrary square away from the map's edges, so that isok() is true and
// the case is about the terrain rather than the bounds. <1,0> is the first
// square isok() accepts and is used only by the bounds case below.
const X = 10;
const Y = 5;

// Each row is one path through dig.c dig_typ() (167-192). `arboreal` sets
// svl.level.flags.arboreal, which rm.h IS_TREE() and dig.c:189 both read.
const DIG_TYP_CASES = [
    // 173, the first test: no tool at all, and a tool that is neither.
    {
        why: 'no wielded object', otyp: null, typ: VWALL,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'a long sword is neither a pick nor an axe',
        otyp: LONG_SWORD, typ: VWALL, expected: DIGTYP_UNDIGGABLE,
    },

    // 177-180, the axe arm. A door first, whatever the terrain under it.
    {
        why: 'an axe at a shut door', otyp: AXE, typ: DOOR, doormask: D_CLOSED,
        expected: DIGTYP_DOOR,
    },
    {
        why: 'an axe at a locked door', otyp: AXE, typ: DOOR,
        doormask: D_LOCKED, expected: DIGTYP_DOOR,
    },
    {
        // monmove.c closed_door() answers FALSE for a doorway with no door,
        // and DOOR terrain is not IS_TREE(), so the arm falls to its else.
        why: 'an axe at an empty doorway', otyp: AXE, typ: DOOR,
        doormask: D_NODOOR, expected: DIGTYP_UNDIGGABLE,
    },
    { why: 'an axe at a tree', otyp: AXE, typ: TREE, expected: DIGTYP_TREE },
    {
        // rm.h IS_TREE() is true for STONE on an arboreal level, which is the
        // one way an axe can answer DIGTYP_TREE at something that is not TREE.
        why: 'an axe at arboreal stone', otyp: AXE, typ: STONE,
        arboreal: true, expected: DIGTYP_TREE,
    },
    {
        // 180. The axe arm has no rock case at all, which is the divergence
        // this file was written for: C swings at the wall instead of digging.
        why: 'an axe at a wall', otyp: AXE, typ: VWALL,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'an axe at unmapped rock', otyp: AXE, typ: STONE,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'an axe at room floor', otyp: AXE, typ: ROOM,
        expected: DIGTYP_UNDIGGABLE,
    },

    // 186-191, the pick arm.
    {
        why: 'a pick at a shut door', otyp: PICK_AXE, typ: DOOR,
        doormask: D_CLOSED, expected: DIGTYP_DOOR,
    },
    {
        // 187. A pick cannot fell a tree, and the tree test sits above the
        // IS_OBSTRUCTED() one that would otherwise call TREE rock.
        why: 'a pick at a tree', otyp: PICK_AXE, typ: TREE,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        // The same ordering seen through IS_TREE()'s arboreal half: without
        // the tree test, 188-189 would answer DIGTYP_ROCK for this square.
        why: 'a pick at arboreal stone', otyp: PICK_AXE, typ: STONE,
        arboreal: true, expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'a pick at a wall', otyp: PICK_AXE, typ: VWALL,
        expected: DIGTYP_ROCK,
    },
    {
        why: 'a pick at unmapped rock', otyp: PICK_AXE, typ: STONE,
        expected: DIGTYP_ROCK,
    },
    {
        // 189's arboreal conjunct needs an IS_OBSTRUCTED() type that is
        // neither a wall nor IS_TREE(); a secret door is one, and a secret
        // corridor is the only other.
        why: 'a pick at a secret door', otyp: PICK_AXE, typ: SDOOR,
        expected: DIGTYP_ROCK,
    },
    {
        why: 'a pick at an arboreal secret door', otyp: PICK_AXE, typ: SDOOR,
        arboreal: true, expected: DIGTYP_UNDIGGABLE,
    },
    {
        // IS_WALL() is what keeps a wall diggable on an arboreal level.
        why: 'a pick at an arboreal wall', otyp: PICK_AXE, typ: VWALL,
        arboreal: true, expected: DIGTYP_ROCK,
    },
    {
        why: 'a pick at room floor', otyp: PICK_AXE, typ: ROOM,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        why: 'a pick in a corridor', otyp: PICK_AXE, typ: CORR,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        // IS_OBSTRUCTED() is `typ < POOL`, so water is the boundary value on
        // its far side.
        why: 'a pick at water', otyp: PICK_AXE, typ: POOL,
        expected: DIGTYP_UNDIGGABLE,
    },
    {
        // is_pick() is a skill test, so the mattock takes the pick arm too.
        why: 'a mattock at a wall', otyp: DWARVISH_MATTOCK, typ: VWALL,
        expected: DIGTYP_ROCK,
    },
];

test('dig_typ answers what each tool would break', () => {
    for (const row of DIG_TYP_CASES) {
        const state = digState();
        state.level.flags.arboreal = row.arboreal ?? false;
        const location = state.level.at(X, Y);
        location.typ = row.typ;
        // rm.h:213-218 aliases doormask onto the field js/game.js calls
        // `flags`; js/hack.js doorMask() reads that one first.
        location.flags = row.doormask ?? 0;
        assert.equal(
            dig_typ(row.otyp === null ? null : tool(row.otyp, state),
                X, Y, state),
            row.expected,
            row.why,
        );
    }
});

test('dig_typ answers undiggable for a square off the map', () => {
    // 173's isok(). Column 0 is off the map for NetHack's purposes even
    // though the array has a slot for it, and dig.c asks before it reads
    // levl[x][y], so the answer cannot depend on what that slot holds.
    const state = digState();
    const location = state.level.at(0, Y);
    location.typ = VWALL;
    assert.equal(
        dig_typ(tool(PICK_AXE, state), 0, Y, state), DIGTYP_UNDIGGABLE,
    );
});

// rot_corpse() reads the floor indexes, the monster grid, and the object
// catalog that obfree() prices merges from; timeout_globals_init() is there
// because dealloc_obj() clears gt.thrownobj.
function rotState(moves = 254) {
    const state = {
        level: new GameMap(),
        moves,
        program_state: { gameover: false },
        u: { ux: 1, uy: 1, uundetected: false },
        youmonst: {},
    };
    objects_globals_init(state);
    monst_globals_init(state);
    timeout_globals_init(state);
    return state;
}

let nextRotObjectId = 2;

// A corpse whose ROT_CORPSE timer has already fired: run_timers() decrements
// `timed` before the call, and obfree() would otherwise demand a
// stopObjectTimers seam that js/timeout.js cannot supply from inside its own
// drain. See the run_timers ordering test in scripts/timeout.test.mjs.
function floorCorpse(state, x, y, corpsenm = PM_ORC) {
    const corpse = newObject({
        age: 0,
        corpsenm,
        o_id: nextRotObjectId++,
        oclass: state.objects[CORPSE].oc_class,
        otyp: CORPSE,
        quan: 1,
        timed: 0,
    });
    place_object(corpse, x, y, { state });
    return corpse;
}

// A second object under the corpse, so OBJ_AT() is still true once the corpse
// is extracted. The witness session's three due corpses all sit on such a
// pile, which is why they cannot prove the exposure arm on their own.
function floorRock(state, x, y) {
    const rock = newObject({
        o_id: nextRotObjectId++,
        oclass: state.objects[ROCK].oc_class,
        otyp: ROCK,
        quan: 1,
    });
    place_object(rock, x, y, { state });
    return rock;
}

function recordingNewsym() {
    const drawn = [];
    return { drawn, newsym: (x, y) => drawn.push([x, y]) };
}

test('rot_corpse deletes a floor corpse and redraws its square', () => {
    const state = rotState();
    // An arbitrary interior square; the witness session's head timer names
    // <40,5>, and rot_corpse() reads the coordinates off the object rather
    // than from the caller.
    const x = 40;
    const y = 5;
    const rock = floorRock(state, x, y);
    const corpse = floorCorpse(state, x, y);
    const { drawn, newsym } = recordingNewsym();

    rot_corpse(corpse, state.moves, { state, hooks: { newsym } });

    // Both floor indexes: the per-square pile and the level object list.
    assert.equal(state.level.objects[x][y], rock);
    assert.equal(state.level.objlist, rock);
    assert.equal(rock.nobj, null);
    // obfree() -> dealloc_obj() marks the object deleted rather than freeing
    // memory, which is how this port spells C's free().
    assert.equal(corpse.where, OBJ_DELETED);
    assert.deepEqual(drawn, [[x, y]]);
});

test('rot_corpse exposes a hider only once nothing is left to hide under',
    () => {
        // dig.c:2179-2182. The monster is a cave spider, one of the eight
        // hides_under() species (M1_CONCEAL); a jackal is not.
        for (const row of [
            { why: 'lone corpse, hider', under: false, mnum: PM_CAVE_SPIDER,
                expected: 0 },
            { why: 'pile under corpse, hider', under: true,
                mnum: PM_CAVE_SPIDER, expected: 1 },
            { why: 'lone corpse, non-hider', under: false,
                mnum: PM_JACKAL, expected: 1 },
        ]) {
            const state = rotState();
            const x = 30;
            const y = 8;
            if (row.under) floorRock(state, x, y);
            const corpse = floorCorpse(state, x, y);
            const monster = { mnum: row.mnum, mundetected: 1,
                data: state.mons[row.mnum] };
            state.level.monsters[x][y] = monster;
            const { drawn, newsym } = recordingNewsym();

            rot_corpse(corpse, state.moves, { state, hooks: { newsym } });

            assert.equal(monster.mundetected, row.expected, row.why);
            assert.deepEqual(drawn, [[x, y]], row.why);
        }
    });

test('unportedRotCorpseReason names the arm each corpse is waiting on', () => {
    const state = rotState();
    const seam = { state, hooks: { newsym: () => {} } };
    const floor = floorCorpse(state, 12, 6);
    assert.equal(unportedRotCorpseReason(floor, seam), null);

    // dig.c:2158-2178's three non-floor arms all still stop.
    const carried = newObject({ otyp: CORPSE, where: OBJ_INVENT });
    assert.match(
        unportedRotCorpseReason(carried, seam),
        /a corpse on the floor, but one is rotting at where=3/u,
    );

    // rot_organic()'s contents loop at dig.c:2129-2136.
    const holder = floorCorpse(state, 13, 6);
    holder.cobj = newObject({ otyp: ROCK });
    assert.match(
        unportedRotCorpseReason(holder, seam),
        /a rotting corpse to hold nothing/u,
    );

    // shk.c obfree()'s billing seam.
    const owed = floorCorpse(state, 14, 6);
    owed.unpaid = true;
    assert.match(
        unportedRotCorpseReason(owed, seam),
        /a rotting corpse nobody owes for/u,
    );

    // dig.c:2183-2185, mon.c hideunder(&gy.youmonst): the hero is hidden on
    // the rotting corpse's own square and belongs to a hides_under() species.
    const underfoot = floorCorpse(state, 20, 9);
    state.u.ux = 20;
    state.u.uy = 9;
    state.u.uundetected = 1;
    state.youmonst.data = state.mons[PM_CAVE_SPIDER];
    assert.match(
        unportedRotCorpseReason(underfoot, seam),
        /a rotting corpse not under the hidden hero/u,
    );
    // A hero of a species that cannot hide under an object reaches neither
    // C's else-if nor this stop.
    state.youmonst.data = state.mons[PM_JACKAL];
    assert.equal(unportedRotCorpseReason(underfoot, seam), null);
});

test('unportedRotCorpseReason demands the newsym seam it will draw through',
    () => {
        const state = rotState();
        const corpse = floorCorpse(state, 15, 7);
        assert.throws(
            () => unportedRotCorpseReason(corpse, { state }),
            /rot_corpse requires a newsym seam/u,
        );
    });

test('the corpse rot matrix rests long enough for a corpse to come due', () => {
    // loadCorpseRotRecipe() runs validateCleanRecipe(), so calling it is the
    // cleanliness check as well.
    const { segments } = loadCorpseRotRecipe();
    assert.ok(segments.length <= RECORDER_SEGMENT_LIMIT,
        'the matrix records in one chunk');
    for (const segment of segments) {
        // mkobj.c start_corpse_timeout() gives a corpse mklev() placed at
        // least ROT_AGE - rot_adjust turns, which is 250 - 25. A segment that
        // stopped short of that would record a game in which nothing rots.
        const turns = segment.moves.length / 2;
        assert.ok(turns > 225, `${segment.seed} rests past the earliest expiry`);
        assert.match(segment.moves, /^(?:m\.)+$/u,
            `${segment.seed} rests with the no-op prefix throughout`);
        // The turn counter is what dates each map change, and a pet would be
        // free to eat the corpse the segment is waiting for.
        assert.match(segment.nethackrc, /(?:^|,)time(?:,|\n)/u);
        assert.match(segment.nethackrc, /pettype:none/u);
    }
});
