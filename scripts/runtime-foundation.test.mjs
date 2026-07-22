import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
    BRCORNER,
    D_CLOSED,
    MAGIC_PORTAL,
    NON_PM,
    PATCHLEVEL,
    VERSION_MAJOR,
    VERSION_MINOR,
    WEB,
    WM_C_INNER,
    W_NONDIGGABLE,
} from '../js/const.js';
import { engr_at } from '../js/engrave.js';
import { game, resetGame } from '../js/gstate.js';
import { isaac64_init, isaac64_next_uint64 } from '../js/isaac64.js';
import {
    runSegment,
    set_playmode,
    wd_message,
} from '../js/jsmain.js';
import {
    PM_KITTEN,
    PM_LICHEN,
    PM_LITTLE_DOG,
    PM_PONY,
} from '../js/monsters.js';
import { LEATHER_ARMOR, WAN_WISHING } from '../js/objects.js';
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
import { Terminal } from '../js/terminal.js';

async function runWithGridCapture(input) {
    const previous = Terminal.prototype.serialize;
    Terminal.prototype.serialize = function serializeGridForTest() {
        return JSON.stringify(this.grid);
    };
    try {
        const session = await runSegment(input);
        return {
            session,
            grids: session.getScreens().map((screen) => JSON.parse(screen)),
        };
    } finally {
        if (previous) Terminal.prototype.serialize = previous;
        else delete Terminal.prototype.serialize;
    }
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function gridDigest(grid) {
    // Pin every character, recorder-facing color, and attribute in the 24x80
    // capture without embedding 1,920 cells of fixture prose in this test.
    return sha256(JSON.stringify(grid.map(
        (row) => row.map(({ ch, color, attr }) => [ch, color, attr]),
    )));
}

function rowText(grid, row) {
    return grid[row].map((cell) => cell.ch).join('').trimEnd();
}

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

test('newgame wires random, fixed-role, and suppressed starting pets', async () => {
    const run = async ({ seed, role, race, gender, align, pettype = '' }) => {
        await runSegment({
            seed,
            datetime: '20401231235958',
            nethackrc: `OPTIONS=name:PetWiring,role:${role},race:${race},`
                + `gender:${gender},align:${align},!legacy,!tutorial,`
                + `!splash_screen${pettype ? `,pettype:${pettype}` : ''}`,
            moves: '',
            storage: null,
        });
        const id = game.context.startingpet_mid;
        let pet = game.level.monlist;
        while (pet && pet.m_id !== id) pet = pet.nmon;
        return pet;
    };

    const randomPet = await run({
        // Arbitrary distinct seeds keep the three source branches independent.
        seed: 582_031,
        role: 'Healer',
        race: 'human',
        gender: 'female',
        align: 'neutral',
    });
    assert.ok([PM_KITTEN, PM_LITTLE_DOG].includes(
        game.context.startingpet_typ,
    ));
    assert.ok(randomPet);
    assert.equal(randomPet.mnum, game.context.startingpet_typ);
    assert.equal(randomPet.mtame, 10);
    assert.equal(game.u.uconduct.pets, 1);

    const fixedPony = await run({
        seed: 582_037,
        role: 'Knight',
        race: 'human',
        gender: 'male',
        align: 'lawful',
    });
    assert.equal(game.context.startingpet_typ, PM_PONY);
    assert.ok(fixedPony);
    assert.equal(fixedPony.mnum, PM_PONY);
    assert.equal(fixedPony.mtame, 10);

    const suppressed = await run({
        seed: 582_043,
        role: 'Wizard',
        race: 'elf',
        gender: 'male',
        align: 'chaotic',
        pettype: 'none',
    });
    assert.equal(game.context.startingpet_typ, NON_PM);
    assert.equal(game.context.startingpet_mid, undefined);
    assert.equal(suppressed, null);
    assert.equal(game.u.uconduct.pets, 0);
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
        // This arbitrary seed exercises the full startup path. The story text
        // is deterministic, but its fresh pager Lua state performs nhlib's
        // two-draw alignment shuffle before displaying the page.
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

test('explore notice preserves the welcome boundary before preamble RNG', async () => {
    const input = {
        // This independently chosen seed exercises the complete new-game path;
        // mode messaging itself is deterministic and must not consume draws.
        seed: 9_753_186,
        // An ordinary weekday avoids lunar and Friday messages after startup.
        datetime: '20260129120000',
        nethackrc: 'OPTIONS=name:FreshDiff,role:Healer,race:human,'
            + 'gender:male,align:neutral\n'
            + 'OPTIONS=playmode:explore,!legacy,!tutorial,!splash_screen',
    };
    const pending = await runSegment({ ...input, moves: '' });
    assert.equal(pending.getScreens().length, 1);
    const pendingRows = game.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join(''),
    );
    assert.equal(
        pendingRows[0].trimEnd(),
        'Hello FreshDiff, welcome to NetHack!  '
            + 'You are a neutral male human Healer.',
    );
    assert.equal(pendingRows[1].trimEnd(), '--More--');
    assert.equal(game.context.rndencode, undefined);
    assert.equal(game.context.seer_turn, undefined);
    assert.equal(game.program_state.in_moveloop, undefined);

    const continued = await runSegment({ ...input, moves: ' ' });
    assert.equal(continued.getScreens().length, 2);
    const commandRows = game.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join(''),
    );
    assert.equal(
        commandRows[0].trimEnd(),
        'You are in non-scoring explore/discovery mode.',
    );
    assert.deepEqual(
        continued.getCursors()[1],
        [game.u.ux - 1, game.u.uy + 1, 1],
    );
    assert.deepEqual(
        continued.getRngSlices()[1].map((entry) => (
            entry.replace(/=.*/u, '')
        )),
        ['rnd(9000)', 'rnd(30)'],
    );
    assert.equal(game.program_state.in_moveloop, 1);
});

test('startup accessibility notices preserve complete command-boundary state', async () => {
    const mentionMap = await runWithGridCapture({
        seed: 19,
        datetime: '20000110090000',
        nethackrc: 'OPTIONS=name:Named,role:Healer,race:human,'
            + 'gender:male,align:neutral,dogname:Fido\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,'
            + 'mention_map,spot_monsters\n',
        moves: '   ',
    });
    assert.deepEqual(
        mentionMap.grids.map((grid) => rowText(grid, 0)),
        [
            'Hello Named, welcome to NetHack!  '
                + 'You are a neutral male human Healer.--More--',
            'You are in a rectangular 7 by 3 room.  '
                + '(2north,3west): doorway.--More--',
            '(2north,1west): sink.  '
                + '(northwest): tame little dog called Fido.--More--',
            '(3west): doorway.  (1south,2west): closed door.',
        ],
    );
    assert.deepEqual(
        mentionMap.grids.map(gridDigest),
        [
            '26761a4b8bc034e2aaa178a256b55a8e57c692bbed2465277f47082634547771',
            '55eb309a151cb0caa43582df46794074e5e505559b97e171873e1dd336dfb270',
            '2b71514063bf4bd2ac632b778fb8d76c178ca9180855e851a09ac81442d255a5',
            'adab195ce177dbe6ad043be8076f29ebdeb1bb3b379882f4bbbc0c011d60a036',
        ],
    );
    assert.deepEqual(mentionMap.session.getCursors(), [
        [78, 0, 1], [71, 0, 1], [72, 0, 1], [25, 6, 1],
    ]);
    assert.deepEqual(
        mentionMap.session.getRngSlices().map((slice) => [
            slice.length, sha256(slice.join('\n')),
        ]),
        [
            [2713, 'cc6c514f17e1eadba10b19fcc1843ac3701fc767b2bbe4fe8d327bc83646ae03'],
            [0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
            [0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
            [2, '55184f9159866256ba9694b4fb630440b6dd61924d29ce37a7d95c91bd628eb3'],
        ],
    );

    const spotMonsters = await runWithGridCapture({
        seed: 103,
        datetime: '20000110090000',
        nethackrc: 'OPTIONS=name:Spot,role:Healer,race:human,'
            + 'gender:male,align:neutral\n'
            + 'OPTIONS=!legacy,!tutorial,!splash_screen,spot_monsters\n',
        moves: ' ',
    });
    assert.deepEqual(
        spotMonsters.grids.map((grid) => rowText(grid, 0)),
        [
            'Hello Spot, welcome to NetHack!  '
                + 'You are a neutral male human Healer.--More--',
            'You see your little dog.  You see a kobold zombie.',
        ],
    );
    assert.deepEqual(spotMonsters.grids.map(gridDigest), [
        'd8a005ec5b92054c616921ebd4ab0477ae3e4d5caed90afd57c6a0f9ab5918ef',
        'c92bec3884be65e2f5b9816a2a7d1f69d17305a03eb609996398c11cbad40858',
    ]);
    assert.deepEqual(spotMonsters.session.getCursors(), [
        [77, 0, 1], [57, 4, 1],
    ]);
    assert.deepEqual(
        spotMonsters.session.getRngSlices().map((slice) => [
            slice.length, sha256(slice.join('\n')),
        ]),
        [
            [2427, '901f1e530cdd65a5947396ca4cede881987e44101ad96ee3b8764b202173fc34'],
            [2, 'e83fc4d48b2347dc71e2b45a245eff6f12db842956dcf6830423e996bda8c75c'],
        ],
    );
});

test('wd_message preserves denied-mode message and cleanup order', async () => {
    const messages = [];
    const pline = async (message) => messages.push(message);
    const deniedWizard = {
        wizard: true,
        discover: true,
        flags: { debug: true, explore: true },
        iflags: { wiz_error_flag: true },
        sysopt: { wizards: 'root games admin' },
    };
    await wd_message(deniedWizard, { pline });
    assert.deepEqual(messages, [
        'Only users root, games, or admin may access debug (wizard) mode.',
        'Entering explore/discovery mode instead.',
    ]);
    assert.equal(deniedWizard.wizard, false);
    assert.equal(deniedWizard.flags.debug, false);
    assert.equal(deniedWizard.discover, true);

    messages.length = 0;
    const deniedExplore = {
        discover: true,
        flags: { explore: true },
        iflags: { explore_error_flag: true, deferred_X: true },
    };
    await wd_message(deniedExplore, { pline });
    assert.deepEqual(messages, ['You cannot access explore mode.']);
    assert.equal(deniedExplore.discover, false);
    assert.equal(deniedExplore.flags.explore, false);
    assert.equal(deniedExplore.iflags.deferred_X, false);

    messages.length = 0;
    const deniedBoth = {
        // set_playmode() has already cleared both denied modes before the
        // port-specific wd_message() reporting hook runs.
        wizard: false,
        discover: false,
        flags: { debug: false, explore: false },
        iflags: {
            wiz_error_flag: true,
            explore_error_flag: true,
            deferred_X: false,
        },
        sysopt: { wizards: '' },
    };
    await wd_message(deniedBoth, { pline });
    assert.deepEqual(messages, [
        'You cannot access debug (wizard) mode.',
    ]);
    assert.equal(deniedBoth.wizard, false);
    assert.equal(deniedBoth.flags.debug, false);
    // unixmain.c's wiz_error branch suppresses the fallback notice and the
    // redundant explore-error cleanup; the earlier denial remains in force.
    assert.equal(deniedBoth.discover, false);
    assert.equal(deniedBoth.flags.explore, false);
    assert.equal(deniedBoth.iflags.deferred_X, false);
});

test('set_playmode applies recorder authorization before new-game state', () => {
    const denied = {
        plname: 'FreshDiff',
        flags: { debug: true, explore: false },
        iflags: {},
        gp: {},
    };
    set_playmode(denied);
    assert.equal(denied.wizard, false);
    assert.equal(denied.discover, true);
    assert.deepEqual(denied.flags, { debug: false, explore: true });
    assert.equal(denied.iflags.wiz_error_flag, true);
    assert.equal(denied.iflags.deferred_X, false);
    assert.deepEqual(denied.sysopt, {
        wizards: 'root games',
        explorers: '*',
    });

    const authorized = {
        plname: 'FreshDiff',
        flags: { debug: true, explore: false },
        iflags: {},
        gp: {},
        sysopt: { wizards: 'root games', explorers: '*' },
    };
    set_playmode(authorized, { loginName: 'root' });
    assert.equal(authorized.wizard, true);
    assert.equal(authorized.discover, false);
    assert.equal(authorized.plname, 'wizard');
    assert.equal(authorized.gp.plnamelen, 6);
});

test('denied debug mode becomes explore before initial inventory generation', async () => {
    const runMode = async (mode) => {
        const session = await runSegment({
            seed: 9_753_186,
            datetime: '20260129120000',
            nethackrc: 'OPTIONS=name:ModeTiming,role:Healer,race:human,'
                + 'gender:male,align:neutral\n'
                + `OPTIONS=playmode:${mode},!legacy,!tutorial,!splash_screen`,
            moves: '',
            storage: null,
        });
        const inventory = [];
        for (let object = game.invent; object; object = object.nobj) {
            inventory.push([object.otyp, object.quan]);
        }
        return {
            inventory,
            rng: [...session.getRngLog()],
            discover: game.discover,
            wizard: game.wizard,
            flags: {
                debug: game.flags.debug,
                explore: game.flags.explore,
            },
            wizError: Boolean(game.iflags.wiz_error_flag),
        };
    };

    const explore = await runMode('explore');
    const deniedDebug = await runMode('debug');
    assert.equal(explore.inventory.some(([otyp]) => otyp === WAN_WISHING), true);
    assert.deepEqual(deniedDebug.inventory, explore.inventory);
    assert.deepEqual(deniedDebug.rng, explore.rng);
    assert.deepEqual(
        {
            discover: deniedDebug.discover,
            wizard: deniedDebug.wizard,
            flags: deniedDebug.flags,
            wizError: deniedDebug.wizError,
        },
        {
            discover: true,
            wizard: false,
            flags: { debug: false, explore: true },
            wizError: true,
        },
    );
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

test('configured tutorial choices skip the query or reach its first command', async () => {
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

    const captured = await runWithGridCapture({
        seed: 730203,
        datetime: '20440517091329',
        nethackrc: `${common}tutorial`,
        // Dismiss the wrapped welcome, tutorial-arrival message, and both
        // source read_engr_at() messages to reach the command boundary.
        moves: '    ',
    });
    const { session: entered, grids } = captured;
    assert.deepEqual(entered.getCursors(), [
        [15, 1, 1],
        [30, 0, 1],
        [48, 0, 1],
        [45, 0, 1],
        [11, 7, 1],
    ]);
    const rows = game.nhDisplay.grid.map(
        (row) => row.map((cell) => cell.ch).join('').trimEnd(),
    );
    assert.equal(rows[0], '');
    assert.equal(rows[7][11], '@');
    assert.match(rows.at(-1), /^Tutorial:1 \$:0 .* AC:10 /u);
    assert.deepEqual(game.u.uz, { dnum: game.tutorial_dnum, dlevel: 1 });
    assert.deepEqual([game.u.ux, game.u.uy], [12, 6]);
    assert.equal(game.invent, null);
    assert.ok(game.gmst_invent);
    assert.equal(game.gmst_stored, true);
    assert.equal(game.iflags.nofollowers, false);
    assert.ok(game.svs.spl_book.every(
        (spell) => Object.values(spell).every((value) => value === 0),
    ));

    assert.deepEqual(grids.map(gridDigest), [
        'e268bfa55cc344a11b395fdd79858af7614280e7fbf954c96698958e985a912f',
        'd6bd4a8019da48e3501315e89ae71e5f8872ca2ba5cc24f0f2689a93103f1243',
        '9e26d011d64cbfeb01f8337933cccb3fa0f292d105b6f2bda3e885c099d0cb8e',
        '04aa492b4331633fa6cf04d81a09fc9a5c7e48b54d28a001e8f4035239709729',
        '45a6eec8dd96b00ed1591e6a70ea9384426e3dc598fab389020fd42833a89ce0',
    ]);
    assert.deepEqual(
        entered.getRngSlices().map((slice) => [
            slice.length, sha256(slice.join('\n')),
        ]),
        [
            [6439, '3ade0b11423715bedcd8f415fa19d7db5e547da72d2a5cd7d515f9bb5744c7e8'],
            [192, 'ac2afbd981bd9fbdc6b74aa1edd8dcc77b10163a56618eaca50cabb5f00a1606'],
            [0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
            [0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
            [0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
        ],
    );

    assert.deepEqual(
        {
            maze: game.level.flags.is_maze_lev,
            randomMonsters: game.level.flags.rndmongen,
            deathDrops: game.level.flags.deathdrops,
            autoSearch: game.level.flags.noautosearch,
            flips: game.specialLevelAllowFlips,
        },
        {
            maze: true,
            randomMonsters: false,
            deathDrops: false,
            autoSearch: true,
            flips: 0,
        },
    );
    assert.deepEqual(game.dndest, {
        lx: 12, ly: 6, hx: 12, hy: 6,
        nlx: -1, nly: -1, nhx: -1, nhy: -1,
    });
    assert.deepEqual(game.updest, game.dndest);
    assert.deepEqual(
        [game.xstart, game.ystart, game.xsize, game.ysize],
        [0, 0, 75, 18],
    );

    const corner = game.level.at(4, 4);
    assert.equal(corner.typ, BRCORNER);
    assert.equal(
        corner.wall_info,
        W_NONDIGGABLE | WM_C_INNER,
        'level finalization applies both non-diggability and wall angles',
    );
    assert.equal(corner.lit, true);
    assert.equal(game.level.at(34, 12).lit, false);
    assert.equal(game.level.at(56, 5).lit, false);
    assert.deepEqual(
        {
            mask: game.level.at(5, 9).doormask,
            horizontal: game.level.at(5, 9).horizontal,
        },
        { mask: D_CLOSED, horizontal: true },
    );
    assert.ok(game.level.traps.some(
        (trap) => trap.tx === 7 && trap.ty === 7
            && trap.ttyp === MAGIC_PORTAL && trap.tseen,
    ));
    assert.ok(game.level.traps.some(
        (trap) => trap.tx === 18 && trap.ty === 19
            && trap.ttyp === WEB && !trap.tseen,
    ));

    const objects = [];
    for (let object = game.level.objlist; object; object = object.nobj)
        objects.push([object.otyp, object.ox, object.oy]);
    assert.ok(objects.some(
        ([otyp, x, y]) => otyp === LEATHER_ARMOR && x === 22 && y === 17,
    ));
    const lichen = game.level.monlist;
    let tutorialLichen = lichen;
    while (tutorialLichen && tutorialLichen.mnum !== PM_LICHEN)
        tutorialLichen = tutorialLichen.nmon;
    assert.deepEqual(
        [tutorialLichen?.mx, tutorialLichen?.my],
        [26, 18],
        'deferred object and monster adapters apply the nonzero origin once',
    );
    assert.deepEqual(
        [game.stairs.sx, game.stairs.sy, game.stairs.up],
        [61, 13, false],
    );
});

test('tutorial movement text follows number-pad and gameplay bindings', async () => {
    const character = 'OPTIONS=name:TutorialKeys,role:Healer,race:human,'
        + 'gender:male,align:neutral\n';
    const cases = [
        {
            seed: 730205,
            config: 'OPTIONS=tutorial,!legacy,!splash_screen,number_pad',
            expected: 'Move around with 4 2 8 6',
        },
        {
            seed: 730206,
            config: 'OPTIONS=tutorial,!legacy,!splash_screen\n'
                + 'BINDINGS=h:nothing,a:movewest',
            expected: 'Move around with a j k l',
        },
        {
            seed: 730207,
            config: 'OPTIONS=tutorial,!legacy,!splash_screen\n'
                + 'BINDINGS=a:movewest',
            expected: 'Move around with h j k l',
        },
        {
            seed: 730208,
            config: 'OPTIONS=tutorial,!legacy,!splash_screen\n'
                + 'BINDINGS=b:movewest',
            expected: 'Move around with b j k l',
        },
        {
            seed: 730209,
            config: 'OPTIONS=tutorial,!legacy,!splash_screen,number_pad:3',
            expected: 'Move around with 4 8 2 6',
            expectedDiagonal: 'Move diagonally with 7 3 9 1',
        },
        {
            seed: 730210,
            config: 'OPTIONS=tutorial,!legacy,!splash_screen,number_pad:-1',
            expected: 'Move around with h j k l',
            expectedDiagonal: 'Move diagonally with b u n z',
        },
        {
            seed: 730211,
            config: 'OPTIONS=tutorial,!legacy,!splash_screen\n'
                + 'BINDINGS=X:nothing',
            expected: 'Move around with h j k l',
            expectedTwoWeapon: "Use 'M-2' to use two weapons at once",
        },
    ];

    for (const {
        seed,
        config,
        expected,
        expectedDiagonal,
        expectedTwoWeapon,
    } of cases) {
        await runSegment({
            seed,
            datetime: '20440517091330',
            nethackrc: character + config,
            moves: '    ',
        });
        assert.equal(engr_at(12, 6, game)?.engr_txt[0], expected);
        if (expectedDiagonal) {
            assert.equal(
                engr_at(8, 5, game)?.engr_txt[0],
                expectedDiagonal,
            );
        }
        if (expectedTwoWeapon) {
            assert.equal(
                engr_at(46, 14, game)?.engr_txt[0],
                expectedTwoWeapon,
            );
        }
    }
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
