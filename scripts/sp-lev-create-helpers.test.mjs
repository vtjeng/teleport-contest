// Source-pinned tests for the pure sp_lev.c helpers that the sp-lev-c-create
// spans ported: the mapfragment record, the encoded-direction and seen-vector
// bit swaps, the packed-coordinate reader, the door search, the tables a Lua
// contents callback receives, the trap-name table, the flood-fill checks, and
// the relative-to-absolute coordinate conversions. Every expected value is
// read from the C function the test names.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ARROW_TRAP,
    COLNO,
    CORR,
    COURT,
    DOOR,
    DRY,
    HOLE,
    HWALL,
    MAX_TYPE,
    NO_TRAP,
    ROOM,
    SCORR,
    SDOOR,
    SP_COORD_PACK,
    SP_COORD_PACK_RANDOM,
    STONE,
    TEMPLE,
    TRAPDOOR,
    VIBRATING_SQUARE,
    VWALL,
    WET,
    W_EAST,
    W_NORTH,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { swapbits } from '../js/hacklib.js';
import {
    cvt_to_abscoord,
    cvt_to_relcoord,
    flip_encoded_dir_bits,
    floodfillchk_match_accessible,
    floodfillchk_match_under,
    get_mkroom_name,
    get_table_traptype_opt,
    get_trapname_bytype,
    get_traptype_byname,
    l_push_mkroom_table,
    l_push_wid_hei_table,
    mapfrag_canmatch,
    mapfrag_error,
    mapfrag_fromstr,
    mapfrag_get,
    mapfrag_match,
    nhl_abs_coord,
    search_door,
    set_floodfillchk_match_under,
    sp_code_jmpaddr,
} from '../js/mklev.js';
import { get_unpacked_coord } from '../js/room_coordinates.js';

function levelState() {
    const state = resetGame();
    state.level = new GameMap();
    return state;
}

test('hacklib.c swapbits() exchanges two bits of a value', () => {
    // 0b0101 with bits 0 and 1 swapped is 0b0110: the bits differ, so both
    // toggle.
    assert.equal(swapbits(0b0101, 0, 1), 0b0110);
    // 0b0011: both bits are set, tmp is 0, and the value is unchanged.
    assert.equal(swapbits(0b0011, 0, 1), 0b0011);
    // Bit 7 moves to bit 1 for a seen-vector style swap.
    assert.equal(swapbits(0x80, 1, 7), 0x02);
});

test('sp_lev.c flip_encoded_dir_bits() transposes xdir[]/ydir[] bits', () => {
    // A vertical flip (flp & 1) swaps bits 1<->7, 2<->6, 3<->5.
    assert.equal(flip_encoded_dir_bits(1, 1 << 1), 1 << 7);
    // A horizontal flip (flp & 2) swaps bits 1<->3, 0<->4, 7<->5.
    assert.equal(flip_encoded_dir_bits(2, 1 << 0), 1 << 4);
    // Both: bit 3 goes to 5 in the vertical pass, then 5 to 7 in the
    // horizontal one.
    assert.equal(flip_encoded_dir_bits(3, 1 << 3), 1 << 7);
    // Bits 0 and 4 are on the vertical axis and survive a vertical flip.
    assert.equal(flip_encoded_dir_bits(1, (1 << 0) | (1 << 4)),
                 (1 << 0) | (1 << 4));
});

test('sp_lev.c sp_code_jmpaddr() adds the jump offset to the position', () => {
    // The source's `#if 0` function returns curpos + jmpaddr.
    assert.equal(sp_code_jmpaddr(10, -3), 7);
    assert.equal(sp_code_jmpaddr(0, 5), 5);
});

test('sp_lev.c get_unpacked_coord() splits packed and random coordinates', () => {
    // SP_COORD_PACK(5, 7): x in the low byte, y in bits 16-23, caller
    // humidity kept.
    assert.deepEqual(get_unpacked_coord(SP_COORD_PACK(5, 7), DRY),
                     { x: 5, y: 7, is_random: 0, getloc_flags: DRY });
    // SP_COORD_PACK_RANDOM(0): no embedded flags, so the default humidity
    // applies.
    assert.deepEqual(get_unpacked_coord(SP_COORD_PACK_RANDOM(0), DRY),
                     { x: -1, y: -1, is_random: 1, getloc_flags: DRY });
    // Embedded WET flags override the DRY default.
    assert.deepEqual(get_unpacked_coord(SP_COORD_PACK_RANDOM(WET), DRY),
                     { x: -1, y: -1, is_random: 1, getloc_flags: WET });
});

test('sp_lev.c mapfrag_fromstr() strips digits and measures the text', () => {
    // stripdigits() removes the "1"; the widest line has 2 characters and
    // there are 2 lines.
    const mf = mapfrag_fromstr('a1b\ncd');
    assert.equal(mf.data, 'ab\ncd');
    assert.equal(mf.wid, 2);
    assert.equal(mf.hei, 2);
    // A trailing newline does not add a line.
    assert.equal(mapfrag_fromstr('ab\ncd\n').hei, 2);
    // MAP_Y_LIM is 21: the 23rd line trips `hei > MAP_Y_LIM` and the
    // fragment is rejected; 22 lines are still accepted.
    assert.equal(mapfrag_fromstr(Array(23).fill('.').join('\n')), null);
    assert.equal(mapfrag_fromstr(Array(22).fill('.').join('\n')).hei, 22);
});

test('sp_lev.c mapfrag_get() indexes lines of wid+1 and converts the character', () => {
    const mf = mapfrag_fromstr('...\n.-.\n..|');
    // '-' at (1, 1) is HWALL, '|' at (2, 2) is VWALL, '.' is ROOM.
    assert.equal(mapfrag_get(mf, 1, 1), HWALL);
    assert.equal(mapfrag_get(mf, 2, 2), VWALL);
    assert.equal(mapfrag_get(mf, 0, 0), ROOM);
    // Outside the fragment the source panics.
    assert.throws(() => mapfrag_get(mf, 3, 0), /outside mapfrag/);
    assert.throws(() => mapfrag_get(mf, 0, -1), /outside mapfrag/);
});

test('sp_lev.c mapfrag_canmatch() and mapfrag_error() need odd dimensions and a terrain center', () => {
    assert.equal(mapfrag_canmatch(mapfrag_fromstr('...\n...\n...')), true);
    // 2x2 is even in both dimensions.
    assert.equal(mapfrag_canmatch(mapfrag_fromstr('..\n..')), false);
    // A null fragment reports the generic error.
    assert.equal(mapfrag_error(null), 'mapfragment error');
    assert.equal(mapfrag_error(mapfrag_fromstr('..\n..')),
                 'mapfragment needs to have odd height and width');
    // 'x' is MAX_TYPE (transparent), which TYP_CANNOT_MATCH rejects as a
    // center.
    assert.equal(mapfrag_error(mapfrag_fromstr('...\n.x.\n...')),
                 'mapfragment center must be valid terrain');
    // A wall center is valid terrain.
    assert.equal(mapfrag_error(mapfrag_fromstr('...\n.-.\n...')), null);
    // A single-character fragment (hell_thick_wall_maze's "w") is 1x1.
    assert.equal(mapfrag_error(mapfrag_fromstr('w')), null);
});

test('sp_lev.c mapfrag_match() compares the pattern around a square, off-map as STONE', () => {
    const state = levelState();
    // A lone HWALL at (10, 10) surrounded by ROOM.
    for (let x = 9; x <= 11; ++x)
        for (let y = 9; y <= 11; ++y)
            state.level.at(x, y).typ = ROOM;
    state.level.at(10, 10).typ = HWALL;
    const mf = mapfrag_fromstr('...\n.w.\n...');
    // 'w' is MATCH_WALL and matches HWALL; the '.' ring matches ROOM.
    assert.equal(mapfrag_match(mf, 10, 10, state), true);
    // Centered one square left, the pattern's center meets ROOM, not a wall.
    assert.equal(mapfrag_match(mf, 9, 10, state), false);
    // At the map edge the missing neighbours count as STONE, which the
    // transparent 'x' accepts but '.' does not.
    const edge = mapfrag_fromstr('xxx\nx.x\nxxx');
    state.level.at(1, 0).typ = ROOM;
    assert.equal(mapfrag_match(edge, 1, 0, state), true);
    assert.equal(mapfrag_match(mf, 1, 0, state), false);
    assert.equal(mapfrag_get(edge, 0, 0), MAX_TYPE);
    assert.equal(state.level.at(0, 0).typ, STONE);
});

test('sp_lev.c search_door() finds the cnt-th door on a room wall', () => {
    const state = levelState();
    // Room interior (5..9, 5..8); doors at (6, 4) and (8, 4) on the north
    // wall (y = ly - 1), a secret door at (10, 6) on the east wall
    // (x = hx + 1).
    const croom = { lx: 5, hx: 9, ly: 5, hy: 8 };
    state.level.at(6, 4).typ = DOOR;
    state.level.at(8, 4).typ = DOOR;
    state.level.at(10, 6).typ = SDOOR;
    assert.deepEqual(search_door(croom, W_NORTH, 0, state), { x: 6, y: 4 });
    // cnt counts down past the first door.
    assert.deepEqual(search_door(croom, W_NORTH, 1, state), { x: 8, y: 4 });
    // Only two doors on that wall.
    assert.equal(search_door(croom, W_NORTH, 2, state), null);
    // SDOOR counts as a door.
    assert.deepEqual(search_door(croom, W_EAST, 0, state), { x: 10, y: 6 });
    // W_ANY is not a wall; the source panics.
    assert.throws(() => search_door(croom, 0, 0, state), /Bad wall/);
});

test('sp_lev.c l_push_wid_hei_table() and l_push_mkroom_table() describe a map and a room', () => {
    assert.deepEqual(l_push_wid_hei_table(5, 3), { width: 5, height: 3 });
    // A 5x3 lit temple: width is 1 + (hx - lx), height 1 + (hy - ly).
    assert.deepEqual(l_push_mkroom_table({
        lx: 3, ly: 4, hx: 7, hy: 6,
        rlit: 1, irregular: false, needjoining: true, rtype: TEMPLE,
    }), {
        width: 5,
        height: 3,
        region: { x1: 3, y1: 4, x2: 7, y2: 6 },
        lit: true,
        irregular: false,
        needjoining: true,
        type: 'temple',
    });
    // room_types[] names COURT "throne"; an unlisted type is "unknown".
    assert.equal(get_mkroom_name(COURT), 'throne');
    assert.equal(get_mkroom_name(COLNO + 1000), 'unknown');
});

test('sp_lev.c trap_types[] readers map Lua trap names to trap types', () => {
    // The first and last trap entries of trap_types[], and its "random"
    // entry, whose type is -1.
    assert.equal(get_traptype_byname('arrow'), ARROW_TRAP);
    assert.equal(get_traptype_byname('vibrating square'), VIBRATING_SQUARE);
    assert.equal(get_traptype_byname('random'), -1);
    // strcmpi(): the comparison ignores case.
    assert.equal(get_traptype_byname('Trap Door'), TRAPDOOR);
    // A name past the terminator is NO_TRAP, which lspo_trap() rejects.
    assert.equal(get_traptype_byname('pitfall'), NO_TRAP);

    // get_table_traptype_opt(): an absent, empty, or unknown field keeps
    // the default, which lspo_trap() passes as -1 (a random trap).
    assert.equal(get_table_traptype_opt({}, 'type', -1), -1);
    assert.equal(get_table_traptype_opt({ type: '' }, 'type', -1), -1);
    assert.equal(get_table_traptype_opt({ type: 'pitfall' }, 'type', -1), -1);
    assert.equal(get_table_traptype_opt({ type: 'hole' }, 'type', -1), HOLE);

    // get_trapname_bytype(): the table's name, "random" for -1, and NULL
    // for NO_TRAP, which only the terminator carries.
    assert.equal(get_trapname_bytype(HOLE), 'hole');
    assert.equal(get_trapname_bytype(-1), 'random');
    assert.equal(get_trapname_bytype(NO_TRAP), null);
});

test('sp_lev.c flood-fill checks match the stored terrain or an accessible square', () => {
    const state = levelState();
    state.level.at(3, 3).typ = ROOM;
    state.level.at(4, 3).typ = CORR;
    state.level.at(5, 3).typ = SDOOR;
    state.level.at(6, 3).typ = SCORR;
    state.level.at(7, 3).typ = HWALL;
    // (8, 3) stays STONE.

    // floodfillchk_match_accessible(): ACCESSIBLE() (DOOR and above) plus
    // the two secret types below it; walls and stone fail.
    assert.equal(floodfillchk_match_accessible(3, 3, state), true);
    assert.equal(floodfillchk_match_accessible(4, 3, state), true);
    assert.equal(floodfillchk_match_accessible(5, 3, state), true);
    assert.equal(floodfillchk_match_accessible(6, 3, state), true);
    assert.equal(floodfillchk_match_accessible(7, 3, state), false);
    assert.equal(floodfillchk_match_accessible(8, 3, state), false);

    // set_floodfillchk_match_under() stores the type that
    // floodfillchk_match_under() compares each square against.
    set_floodfillchk_match_under(CORR);
    assert.equal(floodfillchk_match_under(4, 3, state), true);
    assert.equal(floodfillchk_match_under(3, 3, state), false);
    set_floodfillchk_match_under(STONE);
    assert.equal(floodfillchk_match_under(8, 3, state), true);
    assert.equal(floodfillchk_match_under(4, 3, state), false);
    // The installer it calls, selvar.c set_selection_floodfillchk(), is a
    // recorded gap.
    assert.ok(game.unported.has('selvar.c set_selection_floodfillchk'));
});

test('sp_lev.c cvt_to_abscoord(), cvt_to_relcoord(), and nhl_abs_coord() offset by the room or the map frame', () => {
    // Inside a room whose corner is (10, 4), the room is the origin and the
    // map frame is ignored.
    const inRoom = {
        coder: { croom: { lx: 10, ly: 4 } },
        frame: { xstart: 3, ystart: 2 },
    };
    let c = { x: 2, y: 1 };
    cvt_to_abscoord(c, inRoom);
    assert.deepEqual(c, { x: 12, y: 5 });
    cvt_to_relcoord(c, inRoom);
    assert.deepEqual(c, { x: 2, y: 1 });

    // Outside a room, xstart/ystart apply; unlike get_location(), negative
    // input is offset rather than treated as random.
    const onMap = { coder: { croom: null }, frame: { xstart: 3, ystart: 2 } };
    c = { x: -1, y: -2 };
    cvt_to_abscoord(c, onMap);
    assert.deepEqual(c, { x: 2, y: 0 });
    cvt_to_relcoord(c, onMap);
    assert.deepEqual(c, { x: -1, y: -2 });

    // nh.abscoord(x, y) answers two integers; nh.abscoord({x, y}) a table.
    assert.deepEqual(nhl_abs_coord([2, 1], inRoom), [12, 5]);
    assert.deepEqual(nhl_abs_coord([{ x: 2, y: 1 }], onMap), { x: 5, y: 3 });
    assert.throws(() => nhl_abs_coord(['x'], onMap), /Wrong args/u);
});
