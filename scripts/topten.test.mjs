import assert from 'node:assert/strict';
import test from 'node:test';

import {
    classmon,
    get_rnd_toptenentry,
    observable_depth,
    topten,
    tt_doppel,
} from '../js/topten.js';
import {
    DIED, PANICKED, PERSMAX, KILLED_BY_AN,
} from '../js/const.js';
import { PM_CLERIC, PM_RANGER } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { InMemoryStorage, setStorageForTesting } from '../js/storage.js';

// --- readentry / writeentry round-trip ---
// These are module-internal, so we test them through topten()'s display
// output and through the VFS record file content.

// --- observable_depth ---

test('observable_depth returns dungeon depth for a normal level', () => {
    // C ref: topten.c:182-204. The #if 0 endgame block is disabled,
    // so observable_depth is depth() for every level.
    const state = {
        dungeons: [{ depth_start: 1 }],
        u: { uz: { dnum: 0, dlevel: 5 } },
    };
    // depth() = dungeons[dnum].depth_start + dlevel - 1 = 1+5-1 = 5.
    assert.equal(observable_depth(state.u.uz, state), 5);
});

// --- topten wizard/discover mode ---

test('topten prints wizard mode message and returns without writing record', () => {
    // C ref: topten.c:648-662. In wizard mode, topten prints
    // "Since you were in wizard mode, the score list will not be checked."
    // and returns without modifying the record file.
    const mem = new InMemoryStorage();
    setStorageForTesting(mem);
    try {
        const state = {
            wizard: true,
            discover: false,
            program_state: {},
            nhDisplay: {
                nomuxRaw: { active: false, row: 0, col: 0 },
                rows: 24,
                cols: 80,
                clearScreen() { this._cleared = true; },
                setCell() {},
            },
        };
        topten(DIED, 20260101, state);
        assert.ok(state.nhDisplay.nomuxRaw.active,
            'wizard mode branch wrote raw output');
        // Verify storage was not written.
        assert.equal(mem.getItem('vfs:record'), null,
            'wizard mode should not write a record');
    } finally {
        setStorageForTesting(null);
    }
});

test('topten skips everything when panicking', () => {
    // C ref: topten.c:639. if (program_state.panicking) return;
    const state = { program_state: { panicking: true } };
    // Should not throw, should not access any other state.
    topten(PANICKED, 20260101, state);
});

// --- topten record file format ---

test('topten writes a correctly formatted record line via VFS', () => {
    // Create minimal game state for a Tourist who died in the Gnomish Mines.
    // Verify the record line matches the C format:
    //   "5.0.0 <points> <deathdnum> <deathlev> <maxlvl> <hp> <maxhp> <deaths>
    //    <deathdate> <birthdate> <uid> <plrole> <plrace> <plgend> <plalign>
    //    <name>,<death>\n"
    const mem = new InMemoryStorage();
    setStorageForTesting(mem);
    try {
        const state = makeDeathState({
            points: 124,
            deathdnum: 2, deathlev: 3, maxlvl: 3,
            hp: 0, maxhp: 10, deaths: 1,
            deathdate: 20260101, birthdate: 20260101,
            plname: 'Quincy',
            roleCode: 'Tou', raceCode: 'Hum',
            female: false, alignType: 0, // Neutral
            // KILLED_BY_AN = 0: formatkiller prepends "a " via an().
            killerName: 'gnome', killerFormat: KILLED_BY_AN,
            wizard: false, discover: false,
        });

        topten(DIED, 20260101, state);

        const record = mem.getItem('vfs:record');
        assert.ok(record, 'record file was written');
        // Parse the written line.
        const line = record.trim();
        assert.ok(line.startsWith('5.0.0 124 2 3 3 0 10 1 20260101 20260101 501 '),
            `record line starts with expected fields: ${line}`);
        assert.ok(line.includes('Tou Hum Mal Neu Quincy,killed by a gnome'),
            `record line ends with role/race/gender/align name,death: ${line}`);
    } finally {
        setStorageForTesting(null);
    }
});

test('topten accumulates entries across segments', () => {
    // Segment 1 writes entry A, segment 2 reads it and writes entry B.
    // Both entries should appear in the final record, sorted by points.
    const mem = new InMemoryStorage();
    setStorageForTesting(mem);
    try {
        // Segment 1: hero scores 50 points.
        const state1 = makeDeathState({
            points: 50, deathdnum: 0, deathlev: 1, maxlvl: 1,
            hp: 0, maxhp: 10, deaths: 1,
            deathdate: 20260101, birthdate: 20260101,
            plname: 'Alice', roleCode: 'Val', raceCode: 'Hum',
            female: true, alignType: 0,
            killerName: 'kobold', killerFormat: 1,
            wizard: false, discover: false,
        });
        topten(DIED, 20260101, state1);

        // Segment 2: different player, different role, scores 200 points.
        const state2 = makeDeathState({
            points: 200, deathdnum: 1, deathlev: 5, maxlvl: 5,
            hp: -3, maxhp: 20, deaths: 1,
            deathdate: 20260102, birthdate: 20260102,
            plname: 'Bob', roleCode: 'Ran', raceCode: 'Elf',
            female: false, alignType: -1, // Chaotic
            killerName: 'orc', killerFormat: 1,
            wizard: false, discover: false,
        });
        topten(DIED, 20260102, state2);

        // Verify both entries in the record, higher score first.
        const record = mem.getItem('vfs:record');
        assert.ok(record, 'record exists after two segments');
        const lines = record.trim().split('\n');
        assert.equal(lines.length, 2, 'record has two entries');
        // The score is the second space-separated field (after version).
        const score0 = lines[0].split(' ')[1];
        const score1 = lines[1].split(' ')[1];
        assert.equal(score0, '200', 'first entry has higher score');
        assert.equal(score1, '50', 'second entry has lower score');
    } finally {
        setStorageForTesting(null);
    }
});

test('topten enforces PERSMAX per-player limit', () => {
    // C ref: topten.c:780-798. When the same uid+role has PERSMAX entries,
    // the lowest-scoring one is dropped.
    const mem = new InMemoryStorage();
    setStorageForTesting(mem);
    try {
        // Seed PERSMAX entries with descending scores, same uid and role.
        for (let i = 0; i < PERSMAX; i++) {
            const state = makeDeathState({
                points: 1000 - i * 100,
                deathdnum: 0, deathlev: 1, maxlvl: 1,
                hp: 0, maxhp: 10, deaths: 1,
                deathdate: 20260101, birthdate: 20260101,
                plname: 'Test', roleCode: 'Tou', raceCode: 'Hum',
                female: false, alignType: 0,
                killerName: 'gnome', killerFormat: 1,
                wizard: false, discover: false,
            });
            topten(DIED, 20260101, state);
        }

        let lines = mem.getItem('vfs:record').trim().split('\n');
        assert.equal(lines.length, PERSMAX,
            `after ${PERSMAX} entries from same player, record has PERSMAX lines`);

        // Add one more entry with lowest score -- should be dropped.
        const state = makeDeathState({
            points: 10, deathdnum: 0, deathlev: 1, maxlvl: 1,
            hp: 0, maxhp: 10, deaths: 1,
            deathdate: 20260101, birthdate: 20260101,
            plname: 'Test', roleCode: 'Tou', raceCode: 'Hum',
            female: false, alignType: 0,
            killerName: 'gnome', killerFormat: 1,
            wizard: false, discover: false,
        });
        topten(DIED, 20260101, state);

        lines = mem.getItem('vfs:record').trim().split('\n');
        // The new entry with 10 points is below all existing entries.
        // The PERSMAX limit per uid+role means the lowest entry gets dropped.
        assert.equal(lines.length, PERSMAX,
            'after exceeding PERSMAX, record still has PERSMAX lines');
        // Verify none of the lines contain "10 " as a points value.
        const hasLow = lines.some(l => l.match(/^5\.0\.0 10 /));
        assert.ok(!hasLow, 'the lowest-scoring entry was dropped');
    } finally {
        setStorageForTesting(null);
    }
});

// C refs: topten.c classmon() (1355-1375), get_rnd_toptenentry()
// (1381-1419), and tt_doppel() (1445-1463).  Keep an absent VFS file's
// fopen early return distinct from an existing empty file, whose rank draw is
// still consumed before the null result.
test('scorefile shape selection preserves source rank and role mapping', () => {
    const mem = new InMemoryStorage();
    setStorageForTesting(mem);
    try {
        const missing = {
            mockStorage: mem,
            sysopt: { tt_oname_maxrank: 2 },
        };
        assert.equal(get_rnd_toptenentry({
            state: missing,
            random: { rnd: () => assert.fail('missing file drew rank') },
        }), null);

        mem.setItem('vfs:record', '');
        const draws = [];
        assert.equal(get_rnd_toptenentry({
            state: missing,
            random: { rnd: (bound) => { draws.push(bound); return 2; } },
        }), null);
        assert.deepEqual(draws, [2], 'empty file still consumes rnd(maxrank)');

        const valid = '5.0.0 100 0 1 1 3 4 0 20260101 20260101 501 '
            + 'Pri Hum Mal Law Alice,died\n';
        // C does not filter malformed entries before choosing a rank.  A bad
        // first row makes the requested second row unavailable, then the
        // rank-one retry reads that same bad row and returns null.
        mem.setItem('vfs:record', `malformed\n${valid}`);
        assert.equal(get_rnd_toptenentry({
            state: missing,
            random: { rnd: () => 2 },
        }), null, 'a malformed preceding row is not skipped');

        // With a valid first row, C reads it before the malformed second row,
        // then retries rank one and returns the first entry.
        mem.setItem('vfs:record', `${valid}malformed\n`);
        const entry = get_rnd_toptenentry({
            state: missing,
            random: { rnd: () => 2 },
        });
        assert.equal(entry.plrole, 'Pri');
        assert.equal(classmon(entry.plrole), PM_CLERIC);
        assert.equal(classmon('E'), PM_RANGER,
            'legacy one-character Elf role maps to Ranger');

        const doppel = { female: true };
        const selected = tt_doppel(doppel, {
            state: missing,
            random: {
                rn2: (bound) => { assert.equal(bound, 13); return 1; },
                rnd: (bound) => { assert.equal(bound, 2); return 1; },
                rn1: () => assert.fail('nonempty score entry used fallback'),
            },
            canSeeMonster: () => false,
        });
        assert.equal(selected, PM_CLERIC);
        assert.equal(doppel.female, false, 'score gender applies before class');
    } finally {
        setStorageForTesting(null);
    }
});

test('production startup creates the empty scorefile before play', async () => {
    // This is the independent Wizard doppelganger startup recipe used by the
    // mon.c source span. NethackGame.start() owns creation of recorder state;
    // this witness verifies that path rather than a test-only fallback.
    const storage = new InMemoryStorage();
    await runSegment({
        seed: 9131009,
        datetime: '20261017130000',
        nethackrc: 'OPTIONS=name:DoppelDistressB,role:Wizard,race:human,'
            + 'gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen\n'
            + 'OPTIONS=playmode:debug,pettype:none,!acoustics\n',
        moves: ' \x07doppelganger\nm.',
        storage,
    });
    assert.equal(storage.getItem('vfs:record'), '',
        'startup creates an empty record file when storage is new');
});

// --- Helper to build a minimal game state for topten() ---

function makeDeathState({
    points, deathdnum, deathlev, maxlvl,
    hp, maxhp, deaths,
    deathdate, birthdate,
    plName, plname, roleCode, raceCode,
    female, alignType,
    killerName, killerFormat,
    wizard, discover,
}) {
    const name = plname ?? plName ?? 'Hero';
    return {
        wizard,
        discover,
        program_state: {},
        plname: name,
        // yyyymmdd() uses fixedDatetime to avoid calling now.getTime().
        // The value "20260101-120000" makes every date resolve to 2026-01-01.
        fixedDatetime: '20260101120000',
        recorderIsDst: false,
        flags: {
            female: female ?? false,
            end_top: 10,
            end_around: 2,
            end_own: false,
        },
        u: {
            urexp: points,
            uz: { dnum: deathdnum, dlevel: deathlev },
            uhp: hp,
            uhpmax: maxhp,
            umortality: deaths,
            ualign: { type: alignType },
        },
        urole: { filecode: roleCode },
        urace: { filecode: raceCode },
        killer: { name: killerName, format: killerFormat },
        multi: 0,
        ubirthday: birthdate,
        // deepest_lev_reached walks all dungeons computing
        // depth_start + dunlev_ureached - 1 for each. Provide only the death
        // dungeon with depth_start = 1 so depth = deathlev and maxlvl = deathlev.
        dungeons: Array.from({ length: Math.max(deathdnum + 1, 3) }, (_, i) => ({
            depth_start: 1,
            dunlev_ureached: i === deathdnum ? deathlev : 0,
            num_dunlevs: 20,
            dname: i === 2 ? 'The Gnomish Mines' : 'The Dungeons of Doom',
            flags: { align: 0 },
        })),
        quest_status: {},
        astral_level: { dnum: 99 },
        knox_level: { dnum: 98 },
        // Display stub for raw print output.
        nhDisplay: {
            nomuxRaw: { active: false, row: 0, col: 0 },
            rows: 24,
            cols: 80,
            clearScreen() {},
            setCell() {},
        },
    };
}
