import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as cmd from '../js/cmd.js';
import * as wiz from '../js/wizcmds.js';
import { COLNO, ROWNO, MAX_TYPE, ROOM, STONE, W_NONDIGGABLE } from '../js/const.js';

const c = readFileSync(new URL('../nethack-c/upstream/src/wizcmds.c', import.meta.url), 'utf8');
const ccmd = readFileSync(new URL('../nethack-c/upstream/src/cmd.c', import.meta.url), 'utf8');
function fixture(dnum = 0) {
    const cells = Array.from({ length: ROWNO }, () => Array.from({ length: COLNO },
        () => ({ typ: STONE, wall_info: W_NONDIGGABLE })));
    const state = { cells, u: { uz: { dnum, dlevel: 1 }, ux: 1, uy: 0 },
        level: { at: (x, y) => cells[y][x], flags: { hero_memory: true } },
        specialLevels: [], dungeons: Array.from({ length: 9 },
            () => ({ flags: { hellish: false }, num_dunlevs: 30, dname: 'The Other Branch' })),
        // Distinct source branch identifiers exercise each branch arm below.
        mines_dnum: 2, sokoban_dnum: 3, quest_dnum: 4, tower_dnum: 6,
        knox_level: { dnum: 5, dlevel: 1 }, astral_level: { dnum: 7, dlevel: 1 } };
    return state;
}
async function rowsFor(fn, state) {
    let rows;
    assert.equal(await fn(state, { window: async (s, lines) => {
        assert.equal(s, state); rows = lines.map(line => line.text);
    } }), undefined); // Both selected C helpers return void.
    return rows;
}

test('legend uses the existing complete canonical C levltyp table', async () => {
    assert.equal(typeof wiz.wiz_levltyp_legend, 'function');
    const body = ccmd.split('const char *levltyp[MAX_TYPE + 2] = {')[1].split('};')[0];
    const names = [...body.matchAll(/"([^"]*)"/gu)].map(match => match[1]);
    assert.deepEqual(cmd.levltyp, names);
    assert.equal(cmd.levltyp.length, MAX_TYPE + 2); // Source includes unreachable and padding.
    const rows = await rowsFor(wiz.wiz_levltyp_legend, fixture());
    assert.equal(rows[0], '#terrain encodings:');
    assert.equal(rows[1], '');
    // C SIZE&~1 drops the final odd padding entry; the two halves pair0/19.
    assert.equal(rows.length, 21);
    assert.equal(rows[2], ` 0 - ${'stone'.padEnd(28)} j - ${'drawbridge up'.padEnd(28)}`);
    assert.equal(rows.at(-1), ` i - ${'water'.padEnd(28)} * - ${'unreachable/undiggable'.padEnd(28)}`);
    assert.ok(rows.some(row => row.includes('A - cloud'))); // Index36 is uppercase A.
    assert.match(c, /last = SIZE\(levltyp\) & ~1/u);
});

test('internal map preserves raw codes, tty row zero and invalid column zero marker', async () => {
    assert.equal(typeof wiz.wiz_map_levltyp, 'function');
    const state = fixture();
    for (let typ = 0; typ < MAX_TYPE; typ++)
        state.cells[0][typ + 1] = { typ, wall_info: 0 };
    state.cells[1][0].typ = ROOM; // Source corrupt off-screen column emits trailing !.
    const before = JSON.stringify(state.cells);
    const rows = await rowsFor(wiz.wiz_map_levltyp, state);
    assert.equal(rows[0], ''); // Recorder and options.js expose only tty.
    assert.equal(rows.length, ROWNO + 2); // Blank, all map rows, metadata.
    assert.equal(rows[1].slice(0, MAX_TYPE), '0123456789abcdefghijklmnopqrstuvwxyzA');
    assert.equal(rows[1].length, COLNO - 1);
    assert.equal(rows[2], '*'.repeat(COLNO - 1) + '!');
    assert.equal(rows.at(-1), 'D:0,L:1 dungeon');
    assert.equal(JSON.stringify(state.cells), before);
    assert.match(c, /levl\[0\]\[y\]\.typ != STONE \|\| may_dig\(0, y\)/u);
});

test('metadata preserves every source level flag and default furniture symbol', async () => {
    assert.equal(typeof wiz.wiz_map_levltyp, 'function');
    const flags = [
        ['has_vault', 'vault'], ['has_shop', 'shop'], ['has_temple', 'temple'],
        ['has_court', 'throne'], ['has_zoo', 'zoo'], ['has_morgue', 'morgue'],
        ['has_barracks', 'barracks'], ['has_beehive', 'hive'], ['has_swamp', 'swamp'],
        ['noteleport', 'noTport'], ['hardfloor', 'noDig'], ['nommap', 'noMMap'],
        ['shortsighted', 'shortsight'], ['graveyard', 'graveyard'],
        ['is_maze_lev', 'maze'], ['is_cavernous_lev', 'cave'],
        ['arboreal', 'tree'], ['sokoban_rules', 'sokoban-rules'],
    ];
    for (const [flag, label] of flags) {
        const state = fixture(); state.level.flags[flag] = true;
        assert.equal((await rowsFor(wiz.wiz_map_levltyp, state)).at(-1), `D:0,L:1 ${label} dungeon`);
    }
    const state = fixture(); state.level.flags.hero_memory = false;
    state.level.flags.nfountains = 2; state.level.flags.nsinks = 3; // Unequal counts pin source field order.
    assert.equal((await rowsFor(wiz.wiz_map_levltyp, state)).at(-1), 'D:0,L:1 {:2 {:3 noMem dungeon');
});

test('metadata preserves special flags, invocation/tower order and byte truncation', async () => {
    assert.equal(typeof wiz.wiz_map_levltyp, 'function');
    const state = fixture(8); // Unrecognized branch takes the name-stripping fallback.
    state.specialLevels = [{ dlevel: state.u.uz, proto: 'test',
        flags: { maze_like: true, hellish: true, town: true, rogue_like: true } }];
    state.dungeons[8].flags.hellish = true;
    state.dungeons[8].num_dunlevs = 2; // Current depth1 is the source invocation depth2-1.
    state.wiz1_level = state.u.uz; // Source tower condition is independent of branch id.
    assert.equal((await rowsFor(wiz.wiz_map_levltyp, state)).at(-1),
        'D:8,L:1 "test" mazelike hellish town roguelike invoke tower Other Branch');
    state.specialLevels[0].proto = 'x'.repeat(COLNO); // Force source dsc[COLNO-1] truncation.
    assert.equal((await rowsFor(wiz.wiz_map_levltyp, state)).at(-1), ('D:8,L:1 "' + 'x'.repeat(COLNO)).slice(0, COLNO - 1));
});

test('metadata follows the complete source branch precedence', async () => {
    assert.equal(typeof wiz.wiz_map_levltyp, 'function');
    for (const [dnum, label] of [[0, 'dungeon'], [2, 'mines'], [3, 'sokoban'],
        [4, 'quest'], [5, 'ludios'], [1, 'gehennom'], [6, 'vlad'], [7, 'endgame'], [8, 'Other Branch']]) {
        const state = fixture(dnum);
        assert.equal((await rowsFor(wiz.wiz_map_levltyp, state)).at(-1), `D:${dnum},L:1 ${label}`);
    }
    const state = fixture(8); state.dungeons[8].dname = '';
    assert.equal((await rowsFor(wiz.wiz_map_levltyp, state)).at(-1), 'D:8,L:1 unknown');
});

test('both helpers await text dismissal and have source-aligned terrain callers', async () => {
    for (const name of ['wiz_map_levltyp', 'wiz_levltyp_legend']) {
        assert.equal(typeof wiz[name], 'function');
        let release, finished = false;
        const gate = new Promise(resolve => { release = resolve; });
        const pending = wiz[name](fixture(), { window: async () => gate }).then(() => { finished = true; });
        await Promise.resolve(); assert.equal(finished, false);
        release(); await pending; assert.equal(finished, true);
    }
    const js = readFileSync(new URL('../js/cmd.js', import.meta.url), 'utf8');
    assert.match(ccmd, /case 5:[\s\S]*wiz_map_levltyp\(\);[\s\S]*case 6:[\s\S]*wiz_levltyp_legend\(\);/u);
    assert.match(js, /which === 5[\s\S]*await wiz_map_levltyp\(state\);[\s\S]*which === 6[\s\S]*await wiz_levltyp_legend\(state\);/u);
    assert.doesNotMatch(js, /terrain menu choice \$\{which\} is not ported/u);
});
