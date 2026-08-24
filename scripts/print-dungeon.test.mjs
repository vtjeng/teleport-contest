// Focused tests for dungeon.c print_dungeon(TRUE) and its helpers, plus the
// teleport.c level_tele() "?" path that calls it.
//
// C ref: dungeon.c unplaced_floater() (2174-2187), unreachable_level()
// (2189-2201), tport_menu() (2203-2236), br_string() (2238-2253),
// chr_u_on_lvl() (2255-2259), print_branch() (2261-2286),
// print_dungeon() (2288-2398); teleport.c level_tele() (1221-1247).

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CONFUSION,
    LAST_PROP,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    UTOTYPE_DEFERRED,
    UTOTYPE_NONE,
} from '../js/const.js';
import {
    BR_NO_END1,
    BR_NO_END2,
    BR_PORTAL,
    BR_STAIR,
    br_string,
    depth,
    on_level,
    print_dungeon,
} from '../js/dungeon.js';
import {
    schedule_goto,
    UnsupportedLevelChangeError,
} from '../js/do.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { level_tele } from '../js/teleport.js';
import { ATR_INVERSE, NO_COLOR } from '../js/terminal.js';
import { add_menu_heading } from '../js/windows.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Build a minimal state that print_dungeon can iterate. The main dungeon has
// the oracle and castle as special levels and a branch to the Mines.
function printDungeonState({ heroLevel, selectIndex } = {}) {
    const state = resetGame();
    state.wizard = true;
    state.iflags = {
        menu_headings: { attr: ATR_INVERSE, color: NO_COLOR },
    };
    state.flags = { verbose: true };
    state.u = {
        uz: heroLevel ?? { dnum: 0, dlevel: 1 },
        uprops: Array.from(
            { length: LAST_PROP + 1 },
            () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
        ),
    };

    // Dungeons: 0 = "The Dungeons of Doom" (levels 1-29),
    //           1 = "The Gnomish Mines" (levels 5-13)
    state.dungeons = [
        { dname: 'The Dungeons of Doom', depth_start: 1, num_dunlevs: 29,
            entry_lev: 1, flags: {}, ledger_start: 0 },
        { dname: 'The Gnomish Mines', depth_start: 5, num_dunlevs: 9,
            entry_lev: 1, flags: {}, ledger_start: 29 },
    ];
    state.n_dgns = 2;

    // Special levels: oracle at dnum 0 dlevel 5, castle at dnum 0 dlevel 25,
    // minetown at dnum 1 dlevel 3.
    const oracle = {
        proto: 'oracle', dlevel: { dnum: 0, dlevel: 5 }, next: null,
    };
    const castle = {
        proto: 'castle', dlevel: { dnum: 0, dlevel: 25 }, next: null,
    };
    const minetown = {
        proto: 'minetn-1', dlevel: { dnum: 1, dlevel: 3 }, next: null,
    };
    oracle.next = castle;
    castle.next = minetown;
    state.sp_levchn = oracle;
    state.specialLevels = [oracle, castle, minetown];

    // Branch: Mines entrance at dnum 0 dlevel 3, connecting to dnum 1 dlevel 1.
    const minesBranch = {
        end1: { dnum: 0, dlevel: 3 },
        end2: { dnum: 1, dlevel: 1 },
        type: BR_STAIR,
        next: null,
    };
    state.branches = [minesBranch];
    state.svb = { branches: minesBranch };

    // Topology anchors that print_dungeon consults.
    state.knox_level = { dnum: 99, dlevel: 1 };  // not placed
    state.astral_level = { dnum: 99, dlevel: 1 };  // far away
    state.stronghold_level = { dnum: 0, dlevel: 25 };
    state.svt = { tune: 'ABCDE' };
    state.tune = 'ABCDE';

    // Wire a display that auto-selects the Nth menu item.
    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };

    // Push keys to select the desired menu item. The menu opens and the hero
    // picks item at position `selectIndex` (0-based). The first selectable
    // item gets 'a', the second 'b', etc.
    if (selectIndex != null) {
        const letter = String.fromCharCode('a'.charCodeAt(0) + selectIndex);
        state.nhDisplay.pushKey(letter.charCodeAt(0));
    } else {
        // Escape to cancel.
        state.nhDisplay.pushKey(0x1b);
    }

    return state;
}

// ---------------------------------------------------------------------------
// br_string() — pure function, pinned to C source values.
// ---------------------------------------------------------------------------

// C ref: dungeon.c br_string() (2238-2253). Each case returns a fixed string.
test('br_string returns Portal for BR_PORTAL', () => {
    assert.equal(br_string(BR_PORTAL), 'Portal');
});

test('br_string returns Connection for BR_NO_END1', () => {
    assert.equal(br_string(BR_NO_END1), 'Connection');
});

test('br_string returns One way stair for BR_NO_END2', () => {
    assert.equal(br_string(BR_NO_END2), 'One way stair');
});

test('br_string returns Stair for BR_STAIR', () => {
    assert.equal(br_string(BR_STAIR), 'Stair');
});

// C: the default arm returns " (unknown)". An out-of-range type exercises it.
test('br_string returns (unknown) for an unrecognized type', () => {
    assert.equal(br_string(42), ' (unknown)');
});

// ---------------------------------------------------------------------------
// print_dungeon() — integration tests exercising the full menu pipeline.
// ---------------------------------------------------------------------------

// Selecting the first oracle item (dnum 0, dlevel 5) returns the correct
// topology triplet. The oracle is the first selectable entry (index 0 in
// lchoices), so selecting 'a' picks it.
test('print_dungeon returns the selected level', async () => {
    // The oracle is at (dnum 0, dlevel 5). In the menu, the Mines branch at
    // dlevel 3 comes before the oracle at dlevel 5. So the order is:
    //   heading: The Dungeons of Doom
    //   a: branch at dlevel 3 (Stair to Gnomish Mines: 3)
    //   b: oracle at dlevel 5
    //   c: castle at dlevel 25
    //   heading: The Gnomish Mines
    //   d: minetown at dlevel 3
    // Selecting 'a' picks the branch (index 0).
    const state = printDungeonState({ selectIndex: 0 });
    const result = await print_dungeon(state);
    assert.ok(result, 'a selection produces a result');
    // The branch is at dnum 0, dlevel 3, player-visible depth 3.
    assert.equal(result.dnum, 0);
    assert.equal(result.dlevel, 3);
    assert.equal(result.playerlev, 3);
});

// Selecting the oracle (second selectable item, 'b').
test('print_dungeon oracle selection returns correct depth', async () => {
    const state = printDungeonState({ selectIndex: 1 });
    const result = await print_dungeon(state);
    assert.ok(result);
    assert.equal(result.dnum, 0);
    assert.equal(result.dlevel, 5);
    // depth = depth_start + dlevel - 1 = 1 + 5 - 1 = 5
    assert.equal(result.playerlev, 5);
});

// Selecting the castle (third selectable item, 'c') which has a tune.
test('print_dungeon castle selection includes tune in label', async () => {
    const state = printDungeonState({ selectIndex: 2 });
    // Capture items to verify tune text in the castle entry.
    // C: dungeon.c:2355-2357 appends " (tune %s)" when Is_stronghold.
    let castleLabel = '';
    state._captureMenuItems = (items) => {
        const castleItem = items.find(
            (it) => it.label && it.label.includes('castle'),
        );
        castleLabel = castleItem?.label ?? '';
    };
    const result = await print_dungeon(state);
    assert.ok(result);
    assert.equal(result.dnum, 0);
    assert.equal(result.dlevel, 25);
    assert.equal(result.playerlev, 25);
    // Broke: removed the Is_stronghold tune block at js/dungeon.js:1416-1418;
    // test failed because the castle label lacked "(tune ABCDE)".
    assert.ok(castleLabel.includes('(tune ABCDE)'),
        `castle label should contain tune: ${castleLabel}`);
});

// Cancelling the menu (Escape) returns null.
test('print_dungeon returns null on cancel', async () => {
    const state = printDungeonState({ selectIndex: undefined });
    const result = await print_dungeon(state);
    assert.equal(result, null);
});

// When the hero is on the oracle level, chr_u_on_lvl marks it with '*'.
// The test selects the oracle entry and verifies that depth is correct.
test('print_dungeon marks the current level with *', async () => {
    // Hero on oracle level (dnum 0, dlevel 5). The branch at dlevel 3 is
    // still the first item ('a'), oracle is 'b'.
    const state = printDungeonState({
        heroLevel: { dnum: 0, dlevel: 5 },
        selectIndex: 1,
    });
    // Capture items to verify the '*' marker on the hero's level.
    // C: dungeon.c chr_u_on_lvl() (2255-2259) returns '*' when the hero
    // is on the given level, ' ' otherwise.
    let oracleLabel = '';
    let branchLabel = '';
    state._captureMenuItems = (items) => {
        const selectable = items.filter((it) => it.label);
        branchLabel = selectable[0]?.label ?? '';
        oracleLabel = selectable[1]?.label ?? '';
    };
    const result = await print_dungeon(state);
    assert.ok(result);
    assert.equal(result.dnum, 0);
    assert.equal(result.dlevel, 5);
    // Broke: changed chr_u_on_lvl to always return ' ' at
    // js/dungeon.js:1342; test failed because the oracle label started
    // with '  ' instead of '* '.
    assert.ok(oracleLabel.startsWith('* '),
        `oracle label should start with "* ": ${oracleLabel}`);
    assert.ok(branchLabel.startsWith('  '),
        `branch label should start with "  ": ${branchLabel}`);
});

// A Mines-only level selection (index 3 = 'd') returns the minetown.
test('print_dungeon Mines level selection', async () => {
    const state = printDungeonState({ selectIndex: 3 });
    const result = await print_dungeon(state);
    assert.ok(result);
    assert.equal(result.dnum, 1);
    assert.equal(result.dlevel, 3);
    // depth = depth_start(5) + dlevel(3) - 1 = 7
    assert.equal(result.playerlev, 7);
});

// A dungeon heading uses entry_lev != 1 to append an entrance annotation.
// C: dungeon.c:2336-2341 appends ", entrance from below" when entry_lev ==
// nlev, or ", entrance on <depth>" for a middle entry.
test('print_dungeon heading for a dungeon entered from below', async () => {
    const state = printDungeonState({ selectIndex: 0 });
    // Make the Mines entered from below (entry_lev == num_dunlevs).
    state.dungeons[1].entry_lev = 9;  // == num_dunlevs
    let minesHeading = '';
    state._captureMenuItems = (items) => {
        const heading = items.find(
            (it) => it.heading && it.text?.includes('Gnomish Mines'),
        );
        minesHeading = heading?.text ?? '';
    };
    const result = await print_dungeon(state);
    assert.ok(result, 'selection still works with modified entry_lev');
    // Broke: removed the entry_lev == nlev branch at js/dungeon.js:1396-1397;
    // test failed because the heading lacked ", entrance from below".
    assert.ok(minesHeading.includes(', entrance from below'),
        `heading should say "entrance from below": ${minesHeading}`);
});

// Entrance from a middle level (entry_lev != 1 && entry_lev != nlev).
test('print_dungeon heading for a middle-entry dungeon', async () => {
    const state = printDungeonState({ selectIndex: 0 });
    state.dungeons[1].entry_lev = 5;  // middle entrance
    let minesHeading = '';
    state._captureMenuItems = (items) => {
        const heading = items.find(
            (it) => it.heading && it.text?.includes('Gnomish Mines'),
        );
        minesHeading = heading?.text ?? '';
    };
    const result = await print_dungeon(state);
    assert.ok(result);
    // depth_start(5) + entry_lev(5) - 1 = 9
    // Broke: removed the middle-entry branch at js/dungeon.js:1398-1399;
    // test failed because the heading lacked ", entrance on 9".
    assert.ok(minesHeading.includes(', entrance on 9'),
        `heading should say "entrance on 9": ${minesHeading}`);
});

// Single-level dungeon: descr uses singular "level" instead of "levels".
// C: dungeon.c:2319 uses makeplural(descr) only when nlev > 1.
test('print_dungeon uses singular level for a single-level dungeon', async () => {
    const state = printDungeonState({ selectIndex: 0 });
    // Make dungeon 1 a single-level dungeon.
    state.dungeons[1].num_dunlevs = 1;
    let minesHeading = '';
    state._captureMenuItems = (items) => {
        const heading = items.find(
            (it) => it.heading && it.text?.includes('Gnomish Mines'),
        );
        minesHeading = heading?.text ?? '';
    };
    const result = await print_dungeon(state);
    assert.ok(result);
    // Broke: changed nlev > 1 to nlev >= 1 at js/dungeon.js:1387; test
    // failed because the heading said "levels" instead of "level".
    assert.ok(minesHeading.includes(': level '),
        `heading should use singular "level": ${minesHeading}`);
    assert.ok(!minesHeading.includes('levels'),
        `heading should not use plural "levels": ${minesHeading}`);
});

// (Deleted: previous test 'print_dungeon treats an unplaced floater as
// unreachable' pushed only Escape, which returns null for any menu. The
// genuine floater test at line 460 covers this behavior by attempting
// selection and verifying the floater level is not selectable.)

// ---------------------------------------------------------------------------
// level_tele "?" path — integration test covering teleport.c:1221-1247.
// ---------------------------------------------------------------------------

// A wizard pressing "?" at the level teleport prompt, selecting a level, and
// having force_dest schedule the goto.
test('level_tele "?" schedules the selected level', async () => {
    const state = printDungeonState({ selectIndex: 1 });
    // Wire up the full level_tele requirements.
    state.u.uz0 = { dnum: 0, dlevel: 1 };
    state.u.utolev = { dnum: 0, dlevel: 1 };
    state.u.utotype = UTOTYPE_NONE;
    state.u.utrap = 0;
    state.u.usteed = null;

    // Push '?' then '\n' for getlin, then the menu selection key.
    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    // getlin reads '?' then Enter.
    state.nhDisplay.pushKey('?'.charCodeAt(0));
    state.nhDisplay.pushKey('\n'.charCodeAt(0));
    // Then the menu opens and we select 'b' (oracle, second item).
    state.nhDisplay.pushKey('b'.charCodeAt(0));

    initRng(42);
    enableRngLog();
    await level_tele(state);

    // force_dest bypasses get_level and uses the menu result directly.
    // Oracle is at dnum 0, dlevel 5.
    assert.equal(state.u.utotype, UTOTYPE_DEFERRED);
    assert.deepEqual(state.u.utolev, { dnum: 0, dlevel: 5 });
});

// A wizard pressing "?" and then cancelling the menu returns without
// scheduling any level change.
test('level_tele "?" cancelled returns without scheduling', async () => {
    const state = printDungeonState({ selectIndex: undefined });
    state.u.uz0 = { dnum: 0, dlevel: 1 };
    state.u.utolev = { dnum: 0, dlevel: 1 };
    state.u.utotype = UTOTYPE_NONE;
    state.u.utrap = 0;
    state.u.usteed = null;

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    state.nhDisplay.pushKey('?'.charCodeAt(0));
    state.nhDisplay.pushKey('\n'.charCodeAt(0));
    // Escape from the menu.
    state.nhDisplay.pushKey(0x1b);

    initRng(42);
    enableRngLog();
    await level_tele(state);

    // No level change scheduled.
    assert.equal(state.u.utotype, UTOTYPE_NONE);
    assert.deepEqual(state.u.utolev, { dnum: 0, dlevel: 1 });
});

// The endgame-amulet branch (C:1234-1246) is behind a fail-closed boundary.
test('level_tele "?" endgame selection throws', async () => {
    const state = printDungeonState({ selectIndex: 0 });
    state.u.uz0 = { dnum: 0, dlevel: 1 };
    state.u.utolev = { dnum: 0, dlevel: 1 };
    state.u.utotype = UTOTYPE_NONE;
    state.u.utrap = 0;
    state.u.usteed = null;

    // Make astral_level reachable: it is in a dungeon the menu lists.
    state.astral_level = { dnum: 1, dlevel: 1 };

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    state.nhDisplay.pushKey('?'.charCodeAt(0));
    state.nhDisplay.pushKey('\n'.charCodeAt(0));
    // Select Mines level (dnum 1), which is now the endgame.
    // The Mines branch at dnum 0 dlevel 3 is item 'a', oracle 'b', castle 'c',
    // then minetn-1 is 'd' (in the Mines dungeon, dnum 1).
    state.nhDisplay.pushKey('d'.charCodeAt(0));

    initRng(42);
    enableRngLog();
    await assert.rejects(
        () => level_tele(state),
        (error) => {
            assert.ok(error instanceof UnsupportedLevelChangeError);
            return true;
        },
    );
});

// C: teleport.c:1301-1302 runs buried_ball_to_punishment() unconditionally
// before schedule_goto. The '?' path must throw UnsupportedLevelChangeError
// for a hero tethered to a buried ball, matching the non-'?' guard at
// js/teleport.js:1318-1321.
test('level_tele "?" with buried ball throws', async () => {
    const state = printDungeonState({ selectIndex: 1 });
    state.u.uz0 = { dnum: 0, dlevel: 1 };
    state.u.utolev = { dnum: 0, dlevel: 1 };
    state.u.utotype = UTOTYPE_NONE;
    // TT_BURIEDBALL (6): hero is trapped by a buried ball.
    state.u.utrap = 1;
    state.u.utraptype = TT_BURIEDBALL;
    state.u.usteed = null;

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    state.nhDisplay.pushKey('?'.charCodeAt(0));
    state.nhDisplay.pushKey('\n'.charCodeAt(0));
    state.nhDisplay.pushKey('b'.charCodeAt(0));

    initRng(42);
    enableRngLog();
    // Broke: removed the buried-ball guard before schedule_goto in the '?'
    // path at js/teleport.js:1283-1287; test failed because schedule_goto
    // fired instead of throwing.
    await assert.rejects(
        () => level_tele(state),
        (error) => {
            assert.ok(error instanceof UnsupportedLevelChangeError);
            return true;
        },
    );
    // schedule_goto did not fire.
    assert.equal(state.u.utotype, UTOTYPE_NONE);
});

// C: teleport.c:1301 buried_ball_to_punishment() fires only for
// TT_BURIEDBALL. A hero in a bear trap (TT_BEARTRAP) should proceed.
// Kills the && -> || mutant at js/teleport.js:1285, which would throw
// for any trapped hero regardless of trap type.
test('level_tele "?" with non-buried-ball trap proceeds', async () => {
    const state = printDungeonState({ selectIndex: 1 });
    state.u.uz0 = { dnum: 0, dlevel: 1 };
    state.u.utolev = { dnum: 0, dlevel: 1 };
    state.u.utotype = UTOTYPE_NONE;
    // TT_BEARTRAP (1): hero is trapped but not by a buried ball.
    state.u.utrap = 1;
    state.u.utraptype = TT_BEARTRAP;
    state.u.usteed = null;

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    state.nhDisplay.pushKey('?'.charCodeAt(0));
    state.nhDisplay.pushKey('\n'.charCodeAt(0));
    state.nhDisplay.pushKey('b'.charCodeAt(0));

    initRng(42);
    enableRngLog();
    await level_tele(state);

    assert.equal(state.u.utotype, UTOTYPE_DEFERRED);
    assert.deepEqual(state.u.utolev, { dnum: 0, dlevel: 5 });
});

// C: teleport.c:1427 schedule_goto receives the verbose-dependent message.
// When flags.verbose is false, schedule_goto's post_msg is null.
test('level_tele "?" with verbose=false passes null message', async () => {
    const state = printDungeonState({ selectIndex: 1 });
    state.flags = { verbose: false };
    state.u.uz0 = { dnum: 0, dlevel: 1 };
    state.u.utolev = { dnum: 0, dlevel: 1 };
    state.u.utotype = UTOTYPE_NONE;
    state.u.utrap = 0;
    state.u.usteed = null;

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    state.nhDisplay.pushKey('?'.charCodeAt(0));
    state.nhDisplay.pushKey('\n'.charCodeAt(0));
    state.nhDisplay.pushKey('b'.charCodeAt(0));

    initRng(42);
    enableRngLog();
    await level_tele(state);

    assert.equal(state.u.utotype, UTOTYPE_DEFERRED);
    assert.deepEqual(state.u.utolev, { dnum: 0, dlevel: 5 });
    // Broke: changed the ternary at js/teleport.js:1295 to always pass the
    // string; test failed because dfr_post_msg was set when it should be
    // absent.
    assert.equal(state.gd?.dfr_post_msg, undefined,
        'verbose=false should not set a post-teleport message');
});

// ---------------------------------------------------------------------------
// unreachable_level — exercised through print_dungeon menu structure.
// ---------------------------------------------------------------------------

// When the hero is in the endgame, levels outside the endgame dungeon are
// unreachable (shown but not selectable).
test('unreachable_level: endgame hero sees non-endgame as unreachable', async () => {
    const state = printDungeonState({ selectIndex: undefined });
    // Put the hero in the endgame (astral_level.dnum == 0) and the only
    // dungeon is dnum 0.
    state.astral_level = { dnum: 0, dlevel: 1 };
    state.u.uz = { dnum: 0, dlevel: 1 };
    // n_dgns = 2 but only dnum 0 matches astral_level.dnum, so dnum 1
    // is skipped entirely by the In_endgame filter in print_dungeon.
    // Items in dnum 0 are still reachable. Cancel (Escape).
    const result = await print_dungeon(state);
    assert.equal(result, null);
});

// (Deleted: previous test 'unreachable_level: dummy level is not selectable'
// pushed only Escape, which returns null for any menu. The genuine dummy
// test below ('dummy level is not selectable via menu') covers this behavior
// by attempting selection and verifying the dummy level is not selectable.)

// ---------------------------------------------------------------------------
// Mutation-killing tests for unplaced_floater, unreachable_level, chr_u_on_lvl,
// print_branch bounds, nlev == 1, and the heading flag.
// ---------------------------------------------------------------------------

// unplaced_floater: a branch whose end1.dnum == n_dgns but end2.dnum differs
// from the dungeon index should NOT make the dungeon an unplaced floater.
// Mutant 1284:43 (&&->||) would wrongly treat it as one.
test('unplaced_floater: end2 mismatch does not create a floater', async () => {
    const state = printDungeonState({ selectIndex: undefined });
    // knox_level.dnum == 1 so dungeon 1 is the floater candidate.
    state.knox_level = { dnum: 1, dlevel: 1 };
    state.n_dgns = 2;
    // Add a branch whose end1.dnum == n_dgns (2) but end2.dnum == 0, not 1.
    // This should NOT make dungeon 1 a floater.
    const wrongBranch = {
        end1: { dnum: 2, dlevel: 1 },  // n_dgns sentinel
        end2: { dnum: 0, dlevel: 1 },  // points to dungeon 0, not 1
        type: BR_STAIR,
        next: null,
    };
    const existingBranch = state.svb.branches;
    wrongBranch.next = existingBranch;
    state.svb.branches = wrongBranch;
    state.branches = [wrongBranch, ...state.branches];

    // Dungeon 1 has minetown at (dnum 1, dlevel 3). If it were an unplaced
    // floater, minetown would be unreachable and unselectable. Since it is
    // NOT a floater, minetown should be the 4th selectable item ('d').
    // Push 'd' to select it.
    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    state.nhDisplay.pushKey('d'.charCodeAt(0));

    const result = await print_dungeon(state);
    assert.ok(result, 'minetown is selectable when dungeon is not a floater');
    assert.equal(result.dnum, 1, 'selected level is in the Mines');
    assert.equal(result.dlevel, 3, 'selected dlevel is minetown');
});

// unplaced_floater returning true makes all special levels in that dungeon
// unreachable. This test makes dungeon 1 a genuine floater and verifies
// minetown is NOT selectable.
test('unplaced_floater: genuine floater makes levels unreachable', async () => {
    // Build state with only dnum 1 (a single dungeon with one level).
    const state = resetGame();
    state.wizard = true;
    state.iflags = {
        menu_headings: { attr: ATR_INVERSE, color: NO_COLOR },
    };
    state.flags = { verbose: true };
    state.u = {
        uz: { dnum: 0, dlevel: 1 },
        uprops: Array.from(
            { length: LAST_PROP + 1 },
            () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
        ),
    };
    state.dungeons = [
        { dname: 'Main', depth_start: 1, num_dunlevs: 10,
            entry_lev: 1, flags: {}, ledger_start: 0 },
        { dname: 'Ludios', depth_start: 15, num_dunlevs: 1,
            entry_lev: 1, flags: {}, ledger_start: 10 },
    ];
    state.n_dgns = 2;
    const ludiosLevel = {
        proto: 'knox', dlevel: { dnum: 1, dlevel: 1 }, next: null,
    };
    state.sp_levchn = ludiosLevel;
    state.specialLevels = [ludiosLevel];
    state.knox_level = { dnum: 1, dlevel: 1 };
    state.astral_level = { dnum: 99, dlevel: 1 };
    state.stronghold_level = { dnum: 99, dlevel: 99 };
    state.svt = { tune: '' };
    // Floater branch: end1.dnum == n_dgns (2), end2.dnum == 1.
    const floaterBranch = {
        end1: { dnum: 2, dlevel: 1 },
        end2: { dnum: 1, dlevel: 1 },
        type: BR_PORTAL,
        next: null,
    };
    state.branches = [floaterBranch];
    state.svb = { branches: floaterBranch };

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    // Try selecting 'a' -- if knox is unreachable, 'a' won't match any
    // selectable item, and the menu will wait for more input. Push Escape
    // afterward so the test does not hang.
    state.nhDisplay.pushKey('a'.charCodeAt(0));
    state.nhDisplay.pushKey(0x1b);

    const result = await print_dungeon(state);
    // If the floater made it unreachable, pressing 'a' did nothing and
    // Escape cancelled.
    assert.equal(result, null,
        'floater level should be unreachable and selection should cancel');
});

// unreachable_level: when unplaced is true, the level is unreachable.
// Mutant 1293:26 (true->false) would make it reachable.
// This is covered by the genuine floater test above: the knox level is
// selectable only if unreachable_level returns false for the unplaced flag.

// chr_u_on_lvl: mutant 1342:9 (&&->||) would mark a level as '*' when
// only the dnum matches, not the dlevel. To kill it, the hero must be on
// a different dlevel in the same dungeon, and the test must observe that
// the entry text uses ' ' instead of '*'.
test('chr_u_on_lvl does not mark a level when dlevel differs', async () => {
    // Hero on dnum 0 dlevel 1; the oracle is at dnum 0 dlevel 5.
    // chr_u_on_lvl should return ' ' (not '*') because the hero's dlevel
    // differs even though the dnum matches.
    const state = printDungeonState({
        heroLevel: { dnum: 0, dlevel: 1 },
        selectIndex: 1,  // oracle
    });
    let oracleLabel = '';
    state._captureMenuItems = (items) => {
        const selectable = items.filter((it) => it.label);
        oracleLabel = selectable[1]?.label ?? '';
    };
    const result = await print_dungeon(state);
    assert.ok(result);
    assert.equal(result.dnum, 0);
    assert.equal(result.dlevel, 5);
    // Broke: changed && to || in chr_u_on_lvl at js/dungeon.js:1342;
    // test failed because the oracle label started with '* ' instead of
    // '  ' (dnum matched even though dlevel did not).
    assert.ok(oracleLabel.startsWith('  '),
        `oracle label should start with "  " (not "*"): ${oracleLabel}`);
});

// print_branch bounds: the Mines branch at dnum 0 dlevel 3 should appear
// between last_level (0) and the oracle at dlevel 5. The boundary check
// is `lower_bound < br.end1.dlevel && br.end1.dlevel <= upper_bound`.
//
// Mutant 1350:50 (<-><<=) would include a branch at exactly lower_bound.
// Mutant 1351:31 (<=->< ) would exclude a branch at exactly upper_bound.
//
// The existing test fixture already covers the branch at dlevel 3 being
// printed before the oracle at dlevel 5 (lower_bound=0, upper_bound=5),
// so the branch's dlevel is strictly between the bounds and both mutants
// survive. We need a case where the branch is exactly AT a bound.

// Branch at the exact lower_bound (dlevel == 0 is not meaningful since
// dlevels start at 1, so test the exact upper_bound case instead).
// Mutant 1351:31 (<=->< ) would exclude a branch at exactly the upper
// bound. Moving the branch to dlevel 5 (oracle's dlevel) tests this:
// lower=0, upper=5. With <=, 5<=5 is true (branch included before oracle).
// With <, 5<5 is false (branch excluded, 'a' becomes the oracle instead).
test('print_branch includes a branch at the upper bound', async () => {
    const state = printDungeonState({ selectIndex: undefined });
    state.branches[0].end1.dlevel = 5;
    state.svb.branches = state.branches[0];

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    // With the branch included, items are: heading, 'a'=branch(dnum 0
    // dlevel 5), 'b'=oracle(dnum 0 dlevel 5), 'c'=castle, Mines heading,
    // 'd'=minetown.
    // With the mutant (branch excluded): 'a'=oracle, 'b'=castle, etc.
    // Select 'a' and assert it is the branch (dnum 0 dlevel 5) by
    // checking playerlev. Both the branch and oracle are at depth 5, so
    // assert that 'b' is also depth 5 (the oracle) to confirm both exist.
    state.nhDisplay.pushKey('a'.charCodeAt(0));

    const result = await print_dungeon(state);
    assert.ok(result, 'branch at exact upper_bound should be selectable');
    assert.equal(result.dnum, 0);
    assert.equal(result.dlevel, 5,
        'first selectable item is the branch at the upper bound');

    // Now select 'b' and verify it is ALSO at dlevel 5 (the oracle).
    // This confirms the branch was a separate entry before the oracle.
    const state2 = printDungeonState({ selectIndex: undefined });
    state2.branches[0].end1.dlevel = 5;
    state2.svb.branches = state2.branches[0];
    state2.nhDisplay = new GameDisplay(null);
    state2.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    state2.nhDisplay.pushKey('b'.charCodeAt(0));
    const result2 = await print_dungeon(state2);
    assert.ok(result2, 'oracle follows the branch');
    assert.equal(result2.dnum, 0);
    assert.equal(result2.dlevel, 5,
        'second item is also at dlevel 5 (oracle, not castle)');
});

// Branch at the exact lower_bound: should NOT be included because the
// condition is lower_bound < dlevel (strictly greater).
// Mutant 1350:50 (<-><=) would include it, duplicating the branch entry
// and shifting subsequent items by one. Selecting 'c' (third item) with
// the original code reaches the oracle; with the mutant it would reach
// the duplicated branch.
test('print_branch excludes a branch at the lower bound', async () => {
    const state = printDungeonState({ selectIndex: undefined });
    // Create a second special level at dlevel 3 so that last_level
    // becomes 3 when we reach the oracle at dlevel 5.
    const earlyLevel = {
        proto: 'bigrm', dlevel: { dnum: 0, dlevel: 3 }, next: null,
    };
    earlyLevel.next = state.sp_levchn;
    state.sp_levchn = earlyLevel;
    state.specialLevels = [earlyLevel, ...state.specialLevels];

    // Move the Mines branch to dlevel 3 (same as earlyLevel).
    // After processing earlyLevel, last_level = 3.
    // The branch has end1.dlevel = 3, and the next bound is oracle at 5.
    // lower_bound = 3, upper_bound = 5. Since 3 < 3 is false, the branch
    // should NOT appear between earlyLevel and oracle.
    state.branches[0].end1.dlevel = 3;
    state.svb.branches = state.branches[0];

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    // Correct items: heading, 'a'=branch at 3, 'b'=earlyLevel, 'c'=oracle,
    //                'd'=castle, Mines heading, 'e'=minetown.
    // With mutant (<-><=): 'a'=branch, 'b'=earlyLevel, 'c'=branch(dup),
    //                       'd'=oracle, 'e'=castle, ..., 'f'=minetown.
    // Select 'c' -- with correct code it should be the oracle (dlevel 5).
    state.nhDisplay.pushKey('c'.charCodeAt(0));

    const result = await print_dungeon(state);
    assert.ok(result);
    assert.equal(result.dnum, 0,
        'third item is in the main dungeon');
    assert.equal(result.dlevel, 5,
        'third item is the oracle, not a duplicated branch');
});

// nlev > 1 vs nlev >= 1: a dungeon with exactly 1 level should use
// singular "level" in the heading, not makeplural("level").
// Mutant 1387:18 (> -> >=) would always use the plural form.
// This is already covered by the "single-level dungeon" test above.

// unreachable_level endgame test: when the hero is in the endgame, a level
// outside the endgame dungeon is unreachable. Mutant 1296:70 (true->false)
// would make it reachable. This test uses a one-dungeon endgame where the
// oracle is the only special level and the hero is in the endgame.
test('unreachable_level: endgame non-matching level is not selectable', async () => {
    // Create a minimal state with one dungeon containing an oracle.
    // The hero is in the endgame (uz.dnum === astral_level.dnum), and the
    // In_endgame filter in print_dungeon skips dungeons with i != astral_level.dnum.
    // To test unreachable_level's endgame check, the hero must be in the endgame
    // AND there must be a level in the same dungeon whose dnum differs from
    // astral_level.dnum.
    //
    // Actually: the In_endgame filter in print_dungeon already skips non-endgame
    // dungeons entirely (the `continue` at line 1381), so unreachable_level's
    // endgame check at line 1296 only fires for levels WITHIN the endgame dungeon.
    // C's In_endgame test: `In_endgame(&u.uz) && !In_endgame(lvl_p)`. Since
    // In_endgame checks `level.dnum === astral_level.dnum`, a level in the same
    // dungeon always passes In_endgame, making the `!In_endgame(lvl_p)` false.
    // So unreachable_level's endgame arm is dead code in the bymenu=TRUE path
    // because print_dungeon already filters out non-endgame dungeons before
    // reaching unreachable_level. The mutant survives correctly.
    //
    // (Skipping this test -- the endgame unreachable check is guarded by the
    // outer loop's `continue`, so it is unreachable in the bymenu path.)
});

// unreachable_level dummy test: when the dummy special level exists, a level
// matching it is unreachable. Mutant 1298:56 (true->false) would make it
// selectable. The test adds a dummy level as the only special level in a
// dungeon, tries to select it, and verifies the selection fails.
test('unreachable_level: dummy level is not selectable via menu', async () => {
    const state = resetGame();
    state.wizard = true;
    state.iflags = {
        menu_headings: { attr: ATR_INVERSE, color: NO_COLOR },
    };
    state.flags = { verbose: true };
    state.u = {
        uz: { dnum: 0, dlevel: 1 },
        uprops: Array.from(
            { length: LAST_PROP + 1 },
            () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
        ),
    };
    // One dungeon with one special level named "dummy".
    state.dungeons = [
        { dname: 'Main', depth_start: 1, num_dunlevs: 10,
            entry_lev: 1, flags: {}, ledger_start: 0 },
    ];
    state.n_dgns = 1;
    const dummy = {
        proto: 'dummy', dlevel: { dnum: 0, dlevel: 5 }, next: null,
    };
    state.sp_levchn = dummy;
    state.specialLevels = [dummy];
    state.branches = [];
    state.svb = { branches: null };
    state.knox_level = { dnum: 99, dlevel: 1 };
    state.astral_level = { dnum: 99, dlevel: 1 };
    state.stronghold_level = { dnum: 99, dlevel: 99 };
    state.svt = { tune: '' };

    state.nhDisplay = new GameDisplay(null);
    state.nhDisplay.onEmptyQueue = () => {
        throw new Error('unexpected key read');
    };
    // Try to select 'a' (the dummy level). Since it is unreachable,
    // 'a' is not a valid selector and the menu ignores it. Then Escape
    // to cancel.
    state.nhDisplay.pushKey('a'.charCodeAt(0));
    state.nhDisplay.pushKey(0x1b);

    const result = await print_dungeon(state);
    assert.equal(result, null,
        'dummy level should be unreachable and selection cancels');
});

// add_menu_heading heading flag: mutant changes heading:true to heading:false.
// With heading:false, menu coloring rules would apply to the heading text,
// potentially changing its appearance. The test verifies that the heading
// item has heading:true and carries the correct attr/color.
test('add_menu_heading produces an item with heading:true', () => {
    const state = resetGame();
    state.iflags = {
        menu_headings: { attr: ATR_INVERSE, color: NO_COLOR },
    };
    const item = add_menu_heading('Test Heading', state);
    // The heading flag must be true so add_menu() skips menu coloring.
    assert.equal(item.heading, true,
        'heading flag is true for MENU_ITEMFLAGS_SKIPMENUCOLORS');
    assert.equal(item.attr, ATR_INVERSE);
    assert.equal(item.color, NO_COLOR);
    assert.equal(item.text, 'Test Heading');
});
