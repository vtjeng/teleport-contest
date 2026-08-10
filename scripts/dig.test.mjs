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
    POOL,
    ROOM,
    SDOOR,
    STONE,
    TREE,
    VWALL,
} from '../js/const.js';
import { dig_typ } from '../js/dig.js';
import { GameMap } from '../js/game.js';
import {
    AXE,
    DWARVISH_MATTOCK,
    LONG_SWORD,
    PICK_AXE,
    objects_globals_init,
} from '../js/objects.js';

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
