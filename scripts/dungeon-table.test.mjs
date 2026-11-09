// js/dungeon_table.js dungeon_at() is the one reader of svd.dungeons[]. C
// indexes the table at -1 when it follows a wished magic portal's dst of
// {-1, -1}, and dungeon_at() models that slot from the bytes of svc.context
// it overlays in the recorder's build. A second model of that slot would
// disagree with it as soon as those bytes are not all zero, so this test
// fails when code under js/ indexes the dungeon table any other way.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { depth, dunlevs_in_dungeon, ledger_no } from '../js/dungeon.js';
import { dungeon_at } from '../js/dungeon_table.js';

const JS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const OWNER = 'dungeon_table.js';

// Indexes of a dungeon table (`x.dungeons[i]`, `dungeons?.[i]`,
// `dungeons.at(i)`) in `source`, as file:line.
export function directIndexes(source, file = '<source>') {
    const findings = [];
    for (const match of source.matchAll(
        /\bdungeons\s*(?:\?\.\s*)?(?:\[|\.\s*at\s*\()/gu,
    )) {
        const lineStart = source.lastIndexOf('\n', match.index) + 1;
        const line = source.slice(lineStart, source.indexOf('\n', match.index));
        if (/^\s*(?:\/\/|\*)/u.test(line)) continue;
        if (/^\s*throw new Error\('svd\.dungeons\[-1\]/u.test(line)) continue;
        const lineNumber = source.slice(0, match.index).split('\n').length;
        findings.push(`${file}:${lineNumber}`);
    }
    return findings;
}

function jsFiles() {
    return readdirSync(JS_DIR, { recursive: true })
        .filter((name) => name.endsWith('.js'));
}

test('only dungeon_at() indexes the dungeon table', () => {
    const findings = [];
    for (const name of jsFiles()) {
        const source = readFileSync(join(JS_DIR, name), 'utf8');
        const found = directIndexes(source, name);
        if (name === OWNER) {
            // The one index in dungeon_at() itself.
            assert.equal(found.length, 1, `${OWNER}: ${found.join(', ')}`);
            continue;
        }
        findings.push(...found);
    }
    assert.deepEqual(findings, [], 'index the dungeon table through '
        + 'dungeon_at() in js/dungeon_table.js');
});

// Tests of a dungeon number against -1 or below zero, which is how a second
// model of svd.dungeons[-1] would start (do.js once had one: depth dlevel - 1,
// no levels, ledger dlevel). Each allowed line names a different thing.
const NEGATIVE_DNUM = /\bdnum\s*(?:<\s*0|<=\s*-1|[!=]==?\s*-1)|-1\s*[!=]==?\s*[\w.?]*\bdnum\b/u;
const ALLOWED_NEGATIVE_DNUM = new Map([
    // dungeon_at() itself.
    ['dungeon_table.js', ['if (dnum === -1) return dungeon_before_table(state);']],
    // gl.luathemes[-1], a different table.
    ['mklev.js', ['if (dnum === -1) {']],
    // dname_to_dnum()'s findIndex() found no dungeon of that name.
    ['dungeon.js', ['if (dnum < 0) throw new Error(`dname_to_dnum: unknown dungeon ${dname}`);']],
]);

test('only dungeon_at() treats dungeon -1 apart', () => {
    const findings = [];
    for (const name of jsFiles()) {
        const lines = readFileSync(join(JS_DIR, name), 'utf8').split('\n');
        lines.forEach((line, index) => {
            if (/^\s*(?:\/\/|\*)/u.test(line) || !NEGATIVE_DNUM.test(line)) return;
            if (ALLOWED_NEGATIVE_DNUM.get(name)?.includes(line.trim())) return;
            findings.push(`${name}:${index + 1}`);
        });
    }
    assert.deepEqual(findings, [], 'read dungeon -1 through dungeon_at() '
        + 'in js/dungeon_table.js');
});

test('the negative-dnum check finds the forms a separate model takes', () => {
    // do.js's removed goto_depth(), and three other spellings.
    for (const line of [
        'return level.dnum < 0 ? level.dlevel - 1 : depth(level, state);',
        'if (dnum !== -1) return state.dungeons[dnum].ledger_start;',
        'if (lev.dnum == -1) return 0;',
        'if (-1 === newlevel.dnum) return 0;',
    ]) assert.ok(NEGATIVE_DNUM.test(line), line);
    assert.ok(!NEGATIVE_DNUM.test('if (dnum >= 0) return 1;'));
});

test('the check finds each form of a direct index', () => {
    // One line per form the pattern must catch, and two it must skip.
    const source = [
        'const a = state.dungeons[dnum].depth_start;',
        'const b = state.dungeons?.[dnum]?.flags;',
        'const c = dungeons [i];',
        'const d = state.dungeons.at(-1);',
        '// state.dungeons[-1] in a comment',
        'const e = state.dungeons.length;',
    ].join('\n');
    assert.deepEqual(directIndexes(source), [
        '<source>:1', '<source>:2', '<source>:3', '<source>:4',
    ]);
});

// The expected values are layout/overlay.c's output in
// .cache/lead/wt-dneg1-notes/: it fills these svc.context fields with the
// same bytes and reads them through a dungeon pointer at svc offset 612 with
// the recorder's headers.
test('dungeon_at(-1) reads svc.context as the recorder build lays it out', () => {
    const pasg = Array.from({ length: 30 }, (_, i) => 0x30 + i);
    const state = {
        dungeons: [],
        context: {
            novel: { id: 0x24232221, count: 0x28272625, pasg },
            achieveo: {
                mines_prize_oid: 0x54535251,
                soko_prize_oid: 0x58575655,
                castle_prize_old: 0x5c5b5a59,
                mines_prize_otyp: 0x6261,
                soko_prize_otyp: 0x6463,
                castle_prize_otyp: 0x6665,
                minetn_reached: true,
            },
            lifelist: {
                // Below 2^53, so a number holds every byte.
                total_seen_upclose: 0x0017767574737271,
                total_photographed: 0x000f868584838281,
            },
            jingle: [0x91, 0x92, 0x93, 0x94, 0x95, 0x96],
        },
    };
    const d = dungeon_at(-1, state);
    // dname's first four bytes are tribute_info's padding.
    assert.equal(d.dname, '');
    // proto has no NUL of its own and runs on through fill_lvl's
    // pasg[27..29] to the novel_tracking padding.
    assert.equal(d.proto, String.fromCharCode(
        ...Array.from({ length: 18 }, (_, i) => 0x3c + i)));
    assert.equal(d.fill_lvl, 'KLM');
    assert.equal(d.themerms, '[\\abcdef\x01');
    assert.equal(d.boneid, 'r'); // 114
    assert.deepEqual(d.flags, {
        town: true, hellish: false, maze_like: true, rogue_like: false,
        align: 7, unconnected: false,
    });
    assert.equal(d.entry_lev, -32127);
    assert.equal(d.num_dunlevs, -31613);
    assert.equal(d.dunlev_ureached, -31099);
    assert.equal(d.ledger_start, -1802268015);
    assert.equal(d.depth_start, 38549);
});

test('dungeon_at(-1) flag bits, sign extension and its one write', () => {
    // overlay.c's third case: byte 4 of total_seen_upclose is 0xfe.
    const state = {
        dungeons: [],
        context: {
            lifelist: {
                total_seen_upclose: 0xfe00000000,
                total_photographed: 0x0000fffd0002ffff,
            },
            jingle: [0x43, 0, 0x41, 0x42, 0xc8, 0],
        },
    };
    const d = dungeon_at(-1, state);
    assert.deepEqual(d.flags, {
        town: false, hellish: true, maze_like: true, rogue_like: true,
        align: 7, unconnected: true,
    });
    assert.equal(d.entry_lev, -1);
    assert.equal(d.num_dunlevs, 2);
    assert.equal(d.dunlev_ureached, -3);
    assert.equal(d.ledger_start, 1111556163);
    assert.equal(d.depth_start, 200);

    // overlay.c's last case: dunlev_ureached = -2 rewrites bytes 4-5 of
    // total_photographed, 0x0102030405060708 -> 0x0102fffe05060708. A
    // number cannot hold those; 0x0000030405060708 -> 0x0000fffe05060708
    // changes the same two bytes.
    state.context.lifelist.total_photographed = 0x0000030405060708;
    dungeon_at(-1, state).dunlev_ureached = -2;
    assert.equal(state.context.lifelist.total_photographed, 0x0000fffe05060708);
});

test('depth(), dunlevs_in_dungeon() and ledger_no() read dungeon -1 there', () => {
    const state = { dungeons: [{ ledger_start: 0, num_dunlevs: 29, depth_start: 1 }],
        context: { jingle: [0x43, 0, 0, 0, 0, 0] } };
    const nowhere = { dnum: -1, dlevel: -1 };
    // depth_start is jingle[4..5] = 0: 0 + -1 - 1.
    assert.equal(depth(nowhere, state), -2);
    assert.equal(dunlevs_in_dungeon(nowhere, state), 0);
    // ledger_start is jingle[0..3] = 0x43: 0x43 - 1.
    assert.equal(ledger_no(nowhere, state), 66);
    assert.equal(depth({ dnum: 0, dlevel: 3 }, state), 3);
});
