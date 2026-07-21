import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
} from '../js/const.js';
import { DUNGEON_DATA } from '../js/dungeon_data.js';
import {
    BR_PORTAL,
    Can_dig_down,
    Can_fall_thru,
    Invocation_lev,
    depth,
    find_level,
    induced_align,
    init_dungeons,
    ledger_no,
    level_range,
    maxledgerno,
    on_level,
} from '../js/dungeon.js';
import { game, resetGame } from '../js/gstate.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import {
    parseDungeonSource,
    renderDungeonData,
} from './generate-dungeon-data.mjs';

function initialize(seed, roleFilecode = 'Arc', options = {}) {
    resetGame();
    game.urole = { filecode: roleFilecode };
    initRng(seed);
    enableRngLog();
    init_dungeons(game, undefined, options);
    return {
        state: game,
        rng: [...getRngLog()],
        snapshot: snapshot(game),
    };
}

function snapshot(state) {
    return {
        dungeons: state.dungeons.map((dungeon) => ({
            ...dungeon,
            flags: { ...dungeon.flags },
        })),
        levels: state.specialLevels.map((level) => ({
            proto: level.proto,
            boneid: level.boneid,
            dlevel: { ...level.dlevel },
            flags: { ...level.flags },
            rndlevs: level.rndlevs,
        })),
        branches: state.branches.map((branch) => ({
            id: branch.id,
            type: branch.type,
            end1: { ...branch.end1 },
            end2: { ...branch.end2 },
            end1_up: branch.end1_up,
        })),
        topology: structuredClone(state.dungeon_topology),
        tune: state.tune,
    };
}

function assertLinkedList(array, head) {
    assert.equal(head, array[0] ?? null);
    for (let index = 0; index < array.length; ++index)
        assert.equal(array[index].next, array[index + 1] ?? null);
}

function branchValue(branch) {
    // MAXLEVEL=32 and MAXDUNGEON=16 are the source limits used by
    // dungeon.c:insert_branch() to order branch endpoints.
    return (((branch.end1.dnum * 33) + branch.end1.dlevel) * 17 * 33)
        + (branch.end2.dnum * 33)
        + branch.end2.dlevel;
}

test('on_level is null-safe raw dungeon coordinate equality', () => {
    // Dungeon 2, level 3 is arbitrary; the adjacent coordinates isolate each
    // field, while zero coordinates exercise the unassigned-level sentinel.
    assert.equal(on_level({ dnum: 2, dlevel: 3 }, { dnum: 2, dlevel: 3 }), true);
    assert.equal(on_level({ dnum: 1, dlevel: 3 }, { dnum: 2, dlevel: 3 }), false);
    assert.equal(on_level({ dnum: 2, dlevel: 4 }, { dnum: 2, dlevel: 3 }), false);
    assert.equal(on_level(null, { dnum: 2, dlevel: 3 }), false);
    assert.equal(on_level({ dnum: 2, dlevel: 3 }, undefined), false);
    // Lassigned semantics belong to callers; raw zero coordinates are equal.
    assert.equal(on_level({ dnum: 0, dlevel: 0 }, { dnum: 0, dlevel: 0 }), true);
});

test('induced_align short-circuits special, dungeon, then random masks', () => {
    const state = {
        u: { uz: { dnum: 0, dlevel: 3 } },
        specialLevels: [{
            dlevel: { dnum: 0, dlevel: 3 },
            flags: { align: AM_LAWFUL },
        }],
        dungeons: [{ flags: { align: AM_NEUTRAL } }],
    };
    const run = (draws) => {
        const bounds = [];
        const values = [...draws];
        const result = induced_align(80, state, (bound) => {
            bounds.push(bound);
            return values.shift();
        });
        assert.deepEqual(values, []);
        return { bounds, result };
    };

    assert.deepEqual(run([79]), {
        bounds: [100],
        result: AM_LAWFUL,
    });
    assert.deepEqual(run([80, 0]), {
        bounds: [100, 100],
        result: AM_NEUTRAL,
    });
    assert.deepEqual(run([99, 99, 0]), {
        bounds: [100, 100, 3],
        result: AM_CHAOTIC,
    });
});

test('generated dungeon data exactly matches the pinned Lua table', () => {
    const source = readFileSync(
        new URL('../nethack-c/upstream/dat/dungeon.lua', import.meta.url),
        'utf8',
    );
    const parsed = parseDungeonSource(source);
    assert.deepEqual(DUNGEON_DATA, parsed);
    assert.equal(
        readFileSync(new URL('../js/dungeon_data.js', import.meta.url), 'utf8'),
        renderDungeonData(parsed),
    );

    // dat/dungeon.lua defines nine dungeons, 37 special-level prototypes,
    // and seven connections. These counts catch an omitted table entry.
    assert.equal(DUNGEON_DATA.length, 9);
    assert.equal(
        DUNGEON_DATA.reduce(
            (count, dungeon) => count + (dungeon.levels?.length ?? 0),
            0,
        ),
        37,
    );
    assert.equal(
        DUNGEON_DATA.reduce(
            (count, dungeon) => count + (dungeon.branches?.length ?? 0),
            0,
        ),
        7,
    );
    assert.deepEqual(
        DUNGEON_DATA.map((dungeon) => dungeon.name),
        [
            'The Dungeons of Doom',
            'Gehennom',
            'The Gnomish Mines',
            'The Quest',
            'Sokoban',
            'Fort Ludios',
            "Vlad's Tower",
            'The Elemental Planes',
            'The Tutorial',
        ],
    );
});

test('fresh seeds produce complete, internally consistent topology', () => {
    // These irrational-number prefixes are unrelated to contest recordings
    // and exercise different level placements, lengths, and castle tunes.
    const seeds = [271828, 314159, 1618033, 1414213];
    const snapshots = [];

    for (const seed of seeds) {
        const { state, snapshot: current } = initialize(seed, 'Hea');
        snapshots.push(current);

        assert.equal(state.n_dgns, DUNGEON_DATA.length);
        assert.deepEqual(
            state.dungeons.map((dungeon) => dungeon.dname),
            DUNGEON_DATA.map((dungeon) => dungeon.name),
        );
        assert.equal(state.branches.length, 7);
        // The 40%-chance big room is the only prototype which may be absent.
        assert.ok(
            state.specialLevels.length === 36
            || state.specialLevels.length === 37,
        );
        assertLinkedList(state.branches, state.svb.branches);
        assertLinkedList(state.specialLevels, state.sp_levchn);

        let nextLedger = 0;
        for (const dungeon of state.dungeons) {
            assert.equal(dungeon.ledger_start, nextLedger);
            assert.ok(dungeon.num_dunlevs >= 1 && dungeon.num_dunlevs <= 32);
            assert.ok(
                dungeon.entry_lev >= 1
                && dungeon.entry_lev <= dungeon.num_dunlevs,
            );
            nextLedger += dungeon.num_dunlevs;
        }
        assert.equal(maxledgerno(state), nextLedger);
        assert.equal(
            ledger_no(
                {
                    dnum: state.n_dgns - 1,
                    dlevel: state.dungeons.at(-1).num_dunlevs,
                },
                state,
            ),
            nextLedger,
        );

        for (let index = 1; index < state.branches.length; ++index) {
            assert.ok(
                branchValue(state.branches[index - 1])
                <= branchValue(state.branches[index]),
            );
        }
        assert.deepEqual(
            new Set(state.branches.map((branch) => branch.end2.dnum)),
            // Every connected child dungeon appears once; the tutorial is
            // the sole unconnected dungeon in dat/dungeon.lua.
            new Set([1, 2, 3, 4, 5, 6, 7]),
        );

        const fortBranch = state.branches.find(
            (branch) => branch.end2.dnum === 5,
        );
        assert.equal(fortBranch.end1.dnum, state.n_dgns);

        const occupied = new Set();
        for (const level of state.specialLevels) {
            const dungeon = state.dungeons[level.dlevel.dnum];
            assert.ok(level.dlevel.dlevel >= 1);
            assert.ok(level.dlevel.dlevel <= dungeon.num_dunlevs);
            const key = `${level.dlevel.dnum}:${level.dlevel.dlevel}`;
            assert.equal(occupied.has(key), false);
            occupied.add(key);
        }

        assert.equal(state.dungeon_topology.d_mines_dnum, 2);
        assert.equal(state.dungeon_topology.d_quest_dnum, 3);
        assert.equal(state.dungeon_topology.d_sokoban_dnum, 4);
        assert.equal(state.dungeon_topology.d_tower_dnum, 6);
        assert.equal(state.dungeon_topology.d_tutorial_dnum, 8);
        if (!find_level('bigrm', state)) {
            assert.deepEqual(state.bigroom_level, { dnum: 0, dlevel: 0 });
            assert.equal(
                state.bigroom_level,
                state.dungeon_topology.d_bigroom_level,
            );
        }
        assert.match(state.tune, /^[A-G]{5}$/u);
    }

    assert.ok(
        snapshots.some(
            (candidate) => JSON.stringify(candidate) !== JSON.stringify(snapshots[0]),
        ),
    );
});

test('special-level chains, fixups, and source quirks are preserved', () => {
    const { state } = initialize(57721, 'Wiz');
    const wizard1 = find_level('wizard1', state);
    const wizard2 = find_level('wizard2', state);
    const wizard3 = find_level('wizard3', state);
    assert.equal(wizard2.dlevel.dlevel, wizard1.dlevel.dlevel + 1);
    assert.equal(wizard3.dlevel.dlevel, wizard1.dlevel.dlevel + 2);

    const questLevels = state.specialLevels
        .filter((level) => level.dlevel.dnum === state.quest_dnum)
        .map((level) => level.proto);
    assert.deepEqual(questLevels, ['Wiz-strt', 'Wiz-loca', 'Wiz-goal']);
    assert.deepEqual(state.qstart_level, state.dungeon_topology.d_qstart_level);
    assert.deepEqual(state.qlocate_level, state.dungeon_topology.d_qlocate_level);
    assert.deepEqual(state.nemesis_level, state.dungeon_topology.d_nemesis_level);

    assert.equal(find_level('ORACLE', state).flags.align, 2);
    assert.equal(find_level('medusa', state).flags.align, 1);
    // C's zero char is represented by a falsy empty string so later bones
    // checks can preserve `!boneid` without JS truthiness surprises.
    assert.equal(find_level('medusa', state).boneid, '');
    assert.equal(state.dungeons[state.tutorial_dnum].boneid, '');
    // dungeon.c assigns shifted loader alignment masks to a three-bit field;
    // the recorder's BITFIELDS build truncates those dungeon values to zero.
    assert.ok(state.dungeons.every((dungeon) => dungeon.flags.align === 0));

    const endgame = state.dungeons[7];
    assert.equal(endgame.entry_lev, endgame.num_dunlevs - 1);
    assert.equal(depth(state.earth_level, state), -1);
});

test('non-wizard chance checks and wizard bypass follow source control flow', () => {
    const ordinary = initialize(223606, 'Val');
    const wizard = initialize(223606, 'Val', { wizard: true });
    const ordinaryHundreds = ordinary.rng.filter(
        (entry) => entry.startsWith('rn2(100)='),
    );

    // Nine dungeon tables and 37 level tables each perform one chance check.
    assert.equal(ordinaryHundreds.length, 46);
    assert.equal(
        wizard.rng.some((entry) => entry.startsWith('rn2(100)=')),
        false,
    );
    assert.ok(find_level('bigrm', wizard.state));
    assert.ok(wizard.rng.length < ordinary.rng.length);
});

test('private Lua startup and debug-mode wizard semantics match the source', () => {
    const ordinary = initialize(223606, 'Val');
    assert.match(ordinary.rng[0], /^rn2\(3\)=/u);
    assert.match(ordinary.rng[1], /^rn2\(2\)=/u);

    resetGame();
    game.urole = { filecode: 'Val' };
    game.flags = { debug: true };
    initRng(223606);
    enableRngLog();
    init_dungeons();
    const debugRng = [...getRngLog()];
    assert.match(debugRng[0], /^rn2\(3\)=/u);
    assert.match(debugRng[1], /^rn2\(2\)=/u);
    assert.equal(
        debugRng.some((entry) => entry.startsWith('rn2(100)=')),
        false,
    );
    assert.ok(find_level('bigrm'));
});

test('reinitialization clears a stale optional-level alias', () => {
    resetGame();
    game.urole = { filecode: 'Hea' };
    game.bigroom_level = { dnum: 99, dlevel: 99 };
    initRng(1);
    enableRngLog();

    // Force the optional big room's chance check to fail while keeping every
    // bounded draw valid. This exercises the alias reset without relying on a
    // development fixture or a searched-for seed.
    init_dungeons(game, (bound) => (bound === 100 ? 99 : 0));
    assert.equal(find_level('bigrm'), null);
    assert.deepEqual(game.bigroom_level, { dnum: 0, dlevel: 0 });
    assert.equal(
        game.bigroom_level,
        game.dungeon_topology.d_bigroom_level,
    );
});

test('the same seed and character configuration is exactly repeatable', () => {
    // This fresh seed exercises the actual ISAAC64 wrapper, including call
    // results as well as the requested bounds.
    const first = initialize(173205, 'Ran');
    const second = initialize(173205, 'Ran');
    assert.deepEqual(second.rng, first.rng);
    assert.deepEqual(second.snapshot, first.snapshot);
});

test('level_range implements absolute, end-relative, and chained couples', () => {
    const state = { dungeons: [{ num_dunlevs: 20 }] };
    const pd = {
        // Level 8 is a chosen chain anchor; the tested base of 2 should begin
        // two floors below it and retain all three configured choices.
        final_lev: [{ dlevel: { dnum: 0, dlevel: 8 } }],
    };
    assert.deepEqual(level_range(0, 2, 3, 0, pd, state), {
        base: 10,
        count: 3,
    });
    // A base of -5 means the fifth floor from the bottom, then a range of -1
    // extends through the dungeon's final floor.
    assert.deepEqual(level_range(0, -5, -1, -1, pd, state), {
        base: 16,
        count: 5,
    });
    // Starting at level 19 with four requested choices is clipped at level 20.
    assert.deepEqual(level_range(0, 19, 4, -1, pd, state), {
        base: 19,
        count: 2,
    });
});

test('digging and falling predicates preserve bottom and Castle rules', () => {
    const state = {
        // Ten levels make level 6 intermediate, level 9 the Invocation level
        // in a hellish dungeon, and level 10 the bottom.
        dungeons: [{ num_dunlevs: 10, flags: { hellish: false } }],
        level: { flags: { hardfloor: false } },
    };
    const intermediate = { dnum: 0, dlevel: 6 };
    assert.equal(Invocation_lev(intermediate, state), false);
    assert.equal(Can_dig_down(intermediate, state), true);
    assert.equal(Can_fall_thru(intermediate, state), true);

    state.level.flags.hardfloor = true;
    assert.equal(Can_dig_down(intermediate, state), false);
    assert.equal(Can_fall_thru(intermediate, state), false);

    state.level.flags.hardfloor = false;
    const bottom = { dnum: 0, dlevel: 10 };
    assert.equal(Can_dig_down(bottom, state), false);
    assert.equal(Can_fall_thru(bottom, state), false);

    state.dungeons[0].flags.hellish = true;
    const invocation = { dnum: 0, dlevel: 9 };
    assert.equal(Invocation_lev(invocation, state), true);
    assert.equal(Can_dig_down(invocation, state), false);
    assert.equal(Can_fall_thru(invocation, state), false);

    // The Castle remains fall-through even when its hard floor and bottom
    // status prevent digging, matching Can_fall_thru's source exception.
    state.level.flags.hardfloor = true;
    state.stronghold_level = bottom;
    assert.equal(Can_dig_down(bottom, state), false);
    assert.equal(Can_fall_thru(bottom, state), true);
});
