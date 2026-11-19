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
// What the scan cannot see: an alias under a name it does not recognise, or
// level.rooms passed whole to a helper that indexes it. It catches aliases
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
