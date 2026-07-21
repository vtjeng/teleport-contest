import assert from 'node:assert/strict';
import test from 'node:test';

import { PATCHLEVEL, VERSION_MAJOR, VERSION_MINOR } from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { isaac64_init, isaac64_next_uint64 } from '../js/isaac64.js';
import { runSegment } from '../js/jsmain.js';
import { str2role } from '../js/roles.js';
import {
    d,
    enableRngLog,
    getRngLog,
    initRng,
    rn2,
    rn2_on_display_rng,
    rnd_on_display_rng,
    rnl,
} from '../js/rng.js';
import { vfsWriteFile } from '../js/storage.js';

function seedBytes(seed) {
    let remaining = BigInt(seed) & 0xFFFFFFFFFFFFFFFFn;
    const bytes = new Uint8Array(8);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number(remaining & 0xFFn);
        remaining >>= 8n;
    }
    return bytes;
}

function rawDraw(ctx, range) {
    return Number(isaac64_next_uint64(ctx) % BigInt(range));
}

test('core and display RNGs start from independent copies of the seed', () => {
    // The non-palindromic bytes catch accidental big-endian seed encoding.
    const seed = 0x0102030405060708n;
    const expectedCore = isaac64_init(seedBytes(seed));
    const expectedDisplay = isaac64_init(seedBytes(seed));

    resetGame();
    initRng(seed);
    enableRngLog();

    // 97 exercises a non-power-of-two modulus; 6 covers display rnd's +1.
    const coreFirst = rawDraw(expectedCore, 97);
    const displayFirst = rawDraw(expectedDisplay, 97);
    const coreSecond = rawDraw(expectedCore, 97);
    assert.equal(rn2(97), coreFirst);
    assert.equal(rn2_on_display_rng(97), displayFirst);
    assert.equal(rnd_on_display_rng(6), rawDraw(expectedDisplay, 6) + 1);
    assert.equal(rn2(97), coreSecond);

    assert.deepEqual(getRngLog(), [
        `rn2(97)=${coreFirst}`,
        `rn2(97)=${coreSecond}`,
    ]);
});

test('d uses raw core draws and logs one aggregate call', () => {
    // Three six-sided dice exercise repeated raw draws and the NdX base term.
    const seed = 0x8877665544332211n;
    const expectedCore = isaac64_init(seedBytes(seed));
    const expectedRoll = 3
        + rawDraw(expectedCore, 6)
        + rawDraw(expectedCore, 6)
        + rawDraw(expectedCore, 6);
    // A distinct prime modulus proves that d() left the core stream at the
    // draw immediately after its three raw die rolls.
    const expectedNext = rawDraw(expectedCore, 17);

    resetGame();
    initRng(seed);
    enableRngLog();

    assert.equal(d(3, 6), expectedRoll);
    assert.equal(rn2(17), expectedNext);
    assert.deepEqual(getRngLog(), [
        `d(3,6)=${expectedRoll}`,
        `rn2(17)=${expectedNext}`,
    ]);
});

test('rnl applies small-range Luck and logs its internal rn2 first', () => {
    // Luck -5 and range 10 exercise division rounded away from zero; NetHack
    // reduces -5 to an adjustment of -2 and uses rn2(39) for the luck check.
    const seed = 0x1020304050607080n;
    const expectedCore = isaac64_init(seedBytes(seed));
    const unadjusted = rawDraw(expectedCore, 10);
    const luckCheck = rawDraw(expectedCore, 39);
    const expected = luckCheck ? Math.min(unadjusted + 2, 9) : unadjusted;

    resetGame();
    game.u = { uluck: -5, moreluck: 0 };
    initRng(seed);
    enableRngLog();

    assert.equal(rnl(10), expected);
    assert.deepEqual(getRngLog(), [
        `rn2(39)=${luckCheck}`,
        `rnl(10)=${expected}`,
    ]);
});

test('runSegment preserves datetime and installs the supplied storage', async () => {
    const backing = new Map();
    const storage = {
        getItem(key) { return backing.has(key) ? backing.get(key) : null; },
        setItem(key, value) { backing.set(key, String(value)); },
        removeItem(key) { backing.delete(key); },
        get length() { return backing.size; },
        key(index) { return [...backing.keys()][index] ?? null; },
    };
    // Empty moves make the synthetic segment stop at its first input boundary.
    const datetime = '20401231235958';
    const nhGame = await runSegment({
        // The first six digits echo pi; the value is otherwise an arbitrary
        // seed independent of any development recording.
        seed: 314159,
        datetime,
        // False exercises fresh-recorder metadata plumbing independently of
        // the canonical official-session default.
        recorderIsDst: false,
        nethackrc: 'OPTIONS=name:Runtime,role:Tourist,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: '',
        storage,
    });

    assert.equal(nhGame._datetime, datetime);
    assert.equal(game.fixedDatetime, datetime);
    assert.equal(nhGame._recorderIsDst, false);
    assert.equal(game.recorderIsDst, false);
    assert.equal(vfsWriteFile('/runtime-foundation', 'installed'), true);
    assert.equal(backing.get('vfs:/runtime-foundation'), 'installed');
});

test('runSegment resolves configured random choices without opening selection', async () => {
    // This arbitrary seed exercises role.c's ROLE_RANDOM path. The remaining
    // three choices constrain the draw to source-compatible candidates.
    await runSegment({
        seed: 271828,
        datetime: '20401231235958',
        recorderIsDst: false,
        nethackrc: 'OPTIONS=name:Randomized,role:random,race:human,'
            + 'gender:male,align:neutral,!legacy,!tutorial,!splash_screen,'
            + 'pettype:none',
        moves: '',
        storage: null,
    });

    assert.ok(game.flags.initrole >= 0);
    assert.equal(game.flags.initrace, 0);
    assert.equal(game.flags.initgend, 0);
    assert.equal(game.flags.initalign, 1);
    assert.equal(game.gp.preferred_pet, 'n');
});

test('runSegment may end at an interactive startup boundary', async () => {
    const input = {
        // This arbitrary square-root-of-two prefix is irrelevant to the
        // no-draw manual path; it keeps the case independent of fixtures.
        seed: 141421,
        datetime: '20401231235958',
        nethackrc: 'OPTIONS=name:Boundary,!legacy,!tutorial,!splash_screen',
        storage: null,
    };
    const question = await runSegment({ ...input, moves: '' });
    assert.deepEqual(question.getCursors(), [[74, 0, 1]]);

    // One 'n' consumes the initial question and stops at the role menu.
    const roleMenu = await runSegment({ ...input, moves: 'n' });
    assert.deepEqual(roleMenu.getCursors(), [
        [74, 0, 1],
        [7, 23, 1],
    ]);
});

test('runSegment carries configuration filters into role selection', async () => {
    const nhGame = await runSegment({
        // This arbitrary e-prefix seed is immaterial to the manual menu path.
        seed: 271828,
        datetime: '20401231235958',
        nethackrc: 'OPTIONS=name:Filtered,!role:Wizard,!legacy,!tutorial,'
            + '!splash_screen',
        // 'n' declines automatic selection and stops at the role menu.
        moves: 'n',
        storage: null,
    });

    const wizard = str2role('Wizard');
    assert.equal(game.roleFilter.roles[wizard], true);
    assert.equal(game.rfilter, game.roleFilter);
    assert.equal(nhGame.getCursors().length, 2);
    const roleMenu = game.nhDisplay.terminal.grid.map(
        (row) => row.map((cell) => cell.ch).join(''),
    ).join('\n');
    assert.match(roleMenu, /Archeologist/u);
    assert.doesNotMatch(roleMenu, /Wizard/u);
});

test('tty startup ignores the window-port splash option', async () => {
    const nhGame = await runSegment({
        seed: 161803,
        datetime: '20401231235958',
        recorderIsDst: false,
        nethackrc: 'OPTIONS=name:NoSplashBoundary,role:Healer,race:human,'
            + 'gender:male,align:neutral,!legacy,!tutorial',
        moves: '',
        storage: null,
    });

    assert.equal(game.iflags.wc_splash_screen, true);
    assert.equal(nhGame.getScreens().length, 1);
});

test('runSegment reaches the configured legacy introduction boundary', async () => {
    const nhGame = await runSegment({
        // This arbitrary seed exercises the full startup path; the story text
        // itself is deterministic and consumes no PRNG values.
        seed: 223607,
        datetime: '20401231235958',
        nethackrc: 'OPTIONS=name:Legacy,role:Caveman,race:human,'
            + 'gender:female,align:neutral,legacy,!tutorial,!splash_screen',
        moves: '',
    });

    const screen = game.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join(''),
    ).join('\n');
    assert.match(screen, /It is written in the Book of Ishtar:/u);
    assert.match(screen, /Your goddess Ishtar seeks to possess/u);
    assert.equal(nhGame.getCursors().length, 1);
});

test('runSegment shows welcome More before an unset tutorial query', async () => {
    const input = {
        // This arbitrary seed is independent of development recordings; the
        // boundary under test itself consumes no random values.
        seed: 730201,
        datetime: '20440517091327',
        nethackrc: 'OPTIONS=name:TutorialNo,role:Healer,race:human,'
            + 'gender:male,align:neutral,!legacy,!splash_screen',
    };
    const welcome = await runSegment({ ...input, moves: '' });
    assert.deepEqual(welcome.getCursors(), [[8, 1, 1]]);
    let screen = game.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join(''),
    ).join('\n');
    assert.match(screen, /Hello TutorialNo,/u);
    assert.match(screen, /--More--/u);

    // Space dismisses More, then 'n' declines the tutorial.  The final
    // boundary is the ordinary first command prompt.
    const declined = await runSegment({ ...input, moves: ' n' });
    assert.equal(declined.getCursors().length, 3);
    screen = game.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join(''),
    ).join('\n');
    assert.doesNotMatch(screen, /Do you want a tutorial\?/u);
});

test('configured tutorial choices skip the query or stop at its transition', async () => {
    const common = 'OPTIONS=name:TutorialConfigured,role:Healer,race:human,'
        + 'gender:male,align:neutral,!legacy,!splash_screen,';
    const skipped = await runSegment({
        seed: 730202,
        datetime: '20440517091328',
        nethackrc: `${common}!tutorial`,
        moves: '',
    });
    assert.equal(skipped.getCursors().length, 1);
    const screen = game.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join(''),
    ).join('\n');
    assert.doesNotMatch(screen, /Do you want a tutorial\?/u);

    await assert.rejects(
        runSegment({
            seed: 730203,
            datetime: '20440517091329',
            nethackrc: `${common}tutorial`,
            // The configured name makes welcome() wrap; Space dismisses its
            // immediate TTY More boundary before the configured transition.
            moves: ' ',
        }),
        /tut-1 special-level transition is not implemented/u,
    );
});

test('a command message remains on the next command screen', async () => {
    const nhGame = await runSegment({
        // The long name forces welcome() through More. With rest_on_space
        // disabled, the following Space is an invalid command whose source
        // diagnostic must survive the next redraw.
        seed: 730204,
        datetime: '20260129120000',
        nethackrc: 'OPTIONS=name:MessageRetention,role:Tourist,race:human,'
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen,'
            + '!rest_on_space',
        moves: '  ',
    });
    const topline = game.nhDisplay.grid[0]
        .map((cell) => cell.ch).join('').trimEnd();

    assert.equal(nhGame.getScreens().length, 3);
    assert.equal(topline, "Unknown command ' '.");
});

test('version constants match the pinned NetHack release', () => {
    assert.deepEqual(
        [VERSION_MAJOR, VERSION_MINOR, PATCHLEVEL],
        [5, 0, 0],
    );
});
