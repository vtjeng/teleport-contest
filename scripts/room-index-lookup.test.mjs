// C keeps the top-level rooms and the subrooms in one array: gs.subrooms
// points into svr.rooms[] at MAXNROFROOMS + 1 (decl.c:1169, decl.h:1203), so
// svr.rooms[roomno - ROOMOFFSET] reaches a subroom as readily as a room. The
// port keeps only the top-level rooms in level.rooms and the subrooms in
// game.subrooms, so indexing level.rooms with a room number silently misses
// every subroom (a Minetown shop or temple, the Oracle's centre, a themed
// room's inner room). js/dungeon.js mapseen_room() resolves an index as C
// does. This test fails when game code outside the files that build and
// store the room array indexes level.rooms itself, or when any file indexes
// a room array with a room number (an index that subtracts ROOMOFFSET).
//
// The reverse direction, a room's slot (C's `croom - svr.rooms`), has one
// reading too: js/dungeon.js ROOM_INDEX(). A second test below fails when
// code outside dungeon.js reads roomnoidx, other than the lines that place
// a room in its slot, or searches a room array for a room's position
// (rooms.indexOf(room) gives a wrong number for every subroom).
//
// What the scan cannot see: an alias under a name it does not recognise;
// level.rooms passed whole to a helper that indexes it; `.rooms.at(i)`; and,
// in a home file, an index already offset before it reaches the brackets
// (`rooms[roomno]` where roomno = n - ROOMOFFSET). It catches aliases
// declared with `const|let|var x = <expr>.rooms` and `{ rooms } =`.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');

// Files that may index level.rooms directly. Each walks or builds the
// top-level array with C's own top-level indexes (rooms[i] for i < nroom,
// rooms[nroom], rooms[rn2(nroom)]), never with a room number.
const ROOM_ARRAY_HOMES = {
    // mapseen_room() itself, the one lookup for svr.rooms[index].
    'dungeon.js': 'holds mapseen_room()',
    // mklev.c, sp_lev.c and mkmap.c room creation, sorting, joining and
    // filling.
    'mklev.js': 'creates, sorts and joins the top-level rooms',
    // mkroom.c save_room()/rest_rooms() and the special-room pickers
    // mkshop(), pick_room() and mkswamp(), which scan only [0, nroom).
    'mkroom.js': 'saves, restores and picks top-level rooms',
    // extralev.c makerogrooms()/roguecorr(), whose gr.r[][].nroom is a
    // top-level index.
    'extralev.js': 'builds the Rogue level rooms',
    // mkmaze.c reads rooms[0] of a maze level made with one room.
    'mkmaze.js': 'reads the first room of a single-room level',
};

// A member index `.rooms[...]` or `.rooms?.[...]`, or a bare `rooms[...]`
// (an alias of level.rooms, or a room string from in_rooms()).
const MEMBER_INDEX = /\.rooms\s*(?:\?\.)?\[/u;
const ANY_INDEX = /\brooms\s*(?:\?\.)?\[/gu;
const ALIAS = /\b(?:const|let|var)\s+\w+\s*=\s*[\w.?]*\.rooms\s*(?:\?\?\s*\[\s*\]\s*)?[;,]/u;
const DESTRUCTURE = /\{[^}]*\brooms\b[^}]*\}\s*=/u;

// Strips line and block comments, which quote C's svr.rooms[...] freely.
function codeLines(source) {
    let inBlock = false;
    return source.split('\n').map((line) => {
        let code = line;
        if (inBlock) {
            const end = code.indexOf('*/');
            if (end < 0) return '';
            code = code.slice(end + 2);
            inBlock = false;
        }
        code = code.replace(/\/\*.*?\*\//gu, '');
        const open = code.indexOf('/*');
        if (open >= 0) {
            code = code.slice(0, open);
            inBlock = true;
        }
        const comment = code.indexOf('//');
        return comment >= 0 ? code.slice(0, comment) : code;
    });
}

// Returns the text between the `[` that ends at `start` and its matching
// `]`, so that `rooms[sprooms[0] - ROOMOFFSET]` yields the whole index.
function indexText(code, start) {
    let depth = 1;
    for (let i = start; i < code.length; ++i) {
        if (code[i] === '[') ++depth;
        else if (code[i] === ']' && --depth === 0) return code.slice(start, i);
    }
    return code.slice(start);
}

// Returns "file:line: text" for each line that bypasses mapseen_room().
export function roomIndexFindings(name, source) {
    const home = Object.hasOwn(ROOM_ARRAY_HOMES, name);
    const raw = source.split('\n');
    const findings = [];
    codeLines(source).forEach((code, index) => {
        const byRoomNumber = [...code.matchAll(ANY_INDEX)]
            .some((match) => /\bROOMOFFSET\b/u.test(
                indexText(code, match.index + match[0].length)));
        const outsideHome = !home && (MEMBER_INDEX.test(code)
            || ALIAS.test(code) || DESTRUCTURE.test(code));
        if (byRoomNumber || outsideHome)
            findings.push(`${name}:${index + 1}: ${raw[index].trim()}`);
    });
    return findings;
}

test('only mapseen_room() resolves a room number to a room', () => {
    const findings = readdirSync(JS_DIR)
        .filter((name) => name.endsWith('.js'))
        .flatMap((name) => roomIndexFindings(
            name, readFileSync(join(JS_DIR, name), 'utf8'),
        ));
    assert.deepEqual(findings, [],
        'index a room by number with js/dungeon.js mapseen_room(), as C '
        + 'indexes svr.rooms[] (decl.c:1169)');
});

test('ROOM_ARRAY_HOMES holds the pinned number of files', () => {
    // 5 files on 19 November 2026: dungeon.js, mklev.js, mkroom.js,
    // extralev.js and mkmaze.js.
    const PINNED_HOMES = 5;
    assertExceptionCount(Object.keys(ROOM_ARRAY_HOMES).length, PINNED_HOMES, {
        what: 'ROOM_ARRAY_HOMES files',
        pin: 'PINNED_HOMES in scripts/room-index-lookup.test.mjs',
    });
});

// Lines that write a room's slot as it is placed, the only roomnoidx uses
// outside js/dungeon.js. mklev.c sort_rooms() also reads each room's slot
// from before the sort, which ROOM_INDEX() would misdescribe.
const ROOM_SLOT_WRITES = {
    'mklev.js': [
        // add_room(): a new top-level room takes slot nroom.
        'roomnoidx: g.level.nroom,',
        // add_subroom(): subroom n takes slot MAXNROFROOMS + 1 + n.
        'roomnoidx: MAXNROFROOMS + 1 + g.nsubroom,',
        // sort_rooms() (mklev.c 218-219): the pre-sort slot, then the new one.
        'oldToNew[g.level.rooms[i].roomnoidx] = i;',
        'g.level.rooms[i].roomnoidx = i;',
    ],
    // rest_room(): each subroom slot it restores or skips.
    'mkroom.js': [
        'state.subrooms[advanced].roomnoidx = MAXNROFROOMS + 1 + advanced;',
    ],
};

// A search of a room array for a room: rooms, subrooms or sbrooms, with
// indexOf(), lastIndexOf() or findIndex(). `\b` keeps u.urooms out.
const POSITION_SEARCH
    = /\b(?:sub|sb)?rooms\s*(?:\?\.)?\.(?:indexOf|lastIndexOf|findIndex)\s*\(/u;

// Returns "file:line: text" for each line that recomputes a room's slot
// instead of calling ROOM_INDEX().
export function roomSlotFindings(name, source) {
    if (name === 'dungeon.js') return [];
    const allowed = new Set(ROOM_SLOT_WRITES[name] ?? []);
    const raw = source.split('\n');
    const findings = [];
    codeLines(source).forEach((code, index) => {
        const slotRead = /\broomnoidx\b/u.test(code)
            && !allowed.has(code.trim());
        if (slotRead || POSITION_SEARCH.test(code))
            findings.push(`${name}:${index + 1}: ${raw[index].trim()}`);
    });
    return findings;
}

test('only ROOM_INDEX() turns a room into its slot', () => {
    const sources = readdirSync(JS_DIR)
        .filter((name) => name.endsWith('.js'))
        .map((name) => [name, readFileSync(join(JS_DIR, name), 'utf8')]);
    assert.deepEqual(
        sources.flatMap(([name, source]) => roomSlotFindings(name, source)),
        [],
        'compute a room\'s slot with js/dungeon.js ROOM_INDEX(), as C '
        + 'subtracts svr.rooms (mkroom.h ROOM_INDEX)');
    // Every allowed line must still be present, so the list cannot keep a
    // stale entry that a later line could match.
    const text = new Map(sources);
    for (const [name, lines] of Object.entries(ROOM_SLOT_WRITES)) {
        const present = new Set(codeLines(text.get(name)).map((l) => l.trim()));
        for (const line of lines)
            assert.ok(present.has(line), `${name} no longer has: ${line}`);
    }
});

test('ROOM_SLOT_WRITES holds the pinned number of lines', () => {
    // 5 lines on 19 November 2026: add_room(), add_subroom(), the two
    // sort_rooms() lines and rest_room().
    const PINNED_SLOT_WRITES = 5;
    assertExceptionCount(Object.values(ROOM_SLOT_WRITES).flat().length,
        PINNED_SLOT_WRITES, {
            what: 'ROOM_SLOT_WRITES lines',
            pin: 'PINNED_SLOT_WRITES in scripts/room-index-lookup.test.mjs',
        });
});

test('the slot scan finds each recomputation and skips other rooms', () => {
    // Lines 1-5 are the forms ROOM_INDEX() replaced: mklev.js
    // good_rm_wall_doorpos(), priest.js priestini(), shknam.js
    // good_shopdoor(), sounds.js dosounds() and themerooms.js
    // selection_room(). Line 6 searches the subroom array. Line 7 is a
    // placement line, allowed only in its own file. Lines 8-10 are u.urooms,
    // a room string from in_rooms() and a comment.
    const source = [
        'const rmno = game.level.rooms.indexOf(room) + ROOMOFFSET;',
        'epri.shroom = ((sroom.roomnoidx ?? state.level.rooms.indexOf(sroom))',
        'const roomNumber = (sroom.roomnoidx ?? -1) + ROOMOFFSET;',
        '!== (room.roomnoidx ?? 0) + ROOMOFFSET) {',
        'const roomNumber = room.roomnoidx + ROOMOFFSET;',
        'const slot = state.subrooms.indexOf(croom);',
        'roomnoidx: g.level.nroom,',
        'if (state.u.urooms?.includes(temple)) {',
        'return rooms.includes(String.fromCharCode(roomno));',
        '// C: (croom - svr.rooms), not rooms.indexOf(croom) or roomnoidx',
    ].join('\n');
    assert.deepEqual(
        roomSlotFindings('shknam.js', source)
            .map((f) => Number(f.split(':')[1])),
        [1, 2, 3, 4, 5, 6, 7],
    );
    // mklev.js may write a slot on its placement lines, but not search for one.
    assert.deepEqual(
        roomSlotFindings('mklev.js', source)
            .map((f) => Number(f.split(':')[1])),
        [1, 2, 3, 4, 5, 6],
    );
});

test('the scan finds each bypass and skips comments and top-level loops', () => {
    // Lines 1-6 bypass the lookup outside a home file: the old
    // furniture_present(), mon_in_room(), vault_occupied() and rogue_vision()
    // forms, an alias and a destructuring. Line 7 is a room string from
    // in_rooms(), which is not level.rooms. Lines 8-10 mention the array
    // only in comments, and line 11 walks the top-level rooms.
    const source = [
        'const sroom = state.level?.rooms?.[roomno];',
        'return state.level?.rooms?.[roomno - ROOMOFFSET]?.rtype === rt;',
        'if (state.level.rooms[room - ROOMOFFSET].rtype === VAULT) return room;',
        'const rooms = state.level.rooms ?? [];',
        'const { rooms, nroom } = state.level;',
        'const room = level.rooms[rnum];',
        'const shk = shop_keeper(rooms[0] ?? 0, state);',
        '// C: svr.rooms[roomno - ROOMOFFSET]',
        '/* level.rooms[x] */',
        'x = 1; // rooms[*p - ROOMOFFSET]',
        'for (const room of state.level.rooms) count++;',
    ].join('\n');
    assert.deepEqual(
        roomIndexFindings('sounds.js', source)
            .map((f) => Number(f.split(':')[1])),
        [1, 2, 3, 4, 5, 6],
    );
    // A home file may index by top-level index but not by room number:
    // line 1 is the old shrine_pos() form and line 2 the old create_altar()
    // form; lines 3-5 are C's own top-level indexes.
    const homeSource = [
        'const troom = state.level.rooms[roomno - ROOMOFFSET];',
        'croom = state.level.rooms[sprooms[0] - ROOMOFFSET];',
        'const sroom = state.level.rooms[index];',
        'const terminator = state.level.rooms[state.level.nroom];',
        'const croom = rooms[ci];',
    ].join('\n');
    assert.deepEqual(
        roomIndexFindings('mkroom.js', homeSource)
            .map((f) => Number(f.split(':')[1])),
        [1, 2],
    );
});
